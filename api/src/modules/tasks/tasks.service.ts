import { CreateEstimateDto } from '../estimates/dto/create-estimate.dto';
import { AiEstimatorService } from '../ai-estimator/ai-estimator.service';
import { EstimateSource } from '../estimates/entities/estimate.entity';
import { EstimatesService } from '../estimates/estimates.service';
import { Subtask } from '../ai-estimator/ai-estimator.service';
import { ProjectsService } from '../projects/projects.service';
import { Project } from '../projects/entities/project.entity';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Task } from './entities/task.entity';
import { Repository } from 'typeorm';

import {
  ForbiddenException,
  NotFoundException,
  Injectable,
  Logger,
} from '@nestjs/common';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    private readonly estimatesService: EstimatesService,
    private readonly aiEstimatorService: AiEstimatorService,
    private readonly projectsService: ProjectsService
  ) {}

  async create(
    createTaskDto: CreateTaskDto,
    userId: string
  ): Promise<Task | Task[]> {
    const project = await this.projectsService.findOne(
      createTaskDto.projectId,
      userId
    );

    if (createTaskDto.breakdown) {
      return this.breakdownAndCreateTasks(createTaskDto, project, userId);
    }

    return this.createTaskWithEstimate(createTaskDto, project, userId);
  }

  private async createTaskWithEstimate(
    dto: CreateTaskDto,
    project: Project,
    userId: string,
    parentTask?: Task
  ): Promise<Task> {
    const { projectId, manualEstimate, useAiEstimate, breakdown, ...taskData } =
      dto;

    const task = this.taskRepository.create({
      ...taskData,
      parentTask,
      project: { id: projectId } as any,
    });

    await this.taskRepository.save(task);

    const estimateData: Partial<CreateEstimateDto> = {
      taskId: task.id,
    };

    if (manualEstimate) {
      estimateData.manualEstimate = manualEstimate;
      estimateData.source = EstimateSource.MANUAL;
    }

    if (useAiEstimate && !breakdown) {
      try {
        const aiEstimate = await this.aiEstimatorService.estimateTask(
          dto,
          project
        );
        estimateData.finalEstimate = aiEstimate.finalEstimate;
        estimateData.confidence = aiEstimate.confidence;
        estimateData.explanation = aiEstimate.explanation;
        estimateData.source = EstimateSource.AI;
      } catch (error) {
        this.logger.error(
          `AI estimate failed for task ${task.id}`,
          error.stack
        );
      }
    }

    if (Object.keys(estimateData).length > 1) {
      await this.estimatesService.create(estimateData as CreateEstimateDto);
    }

    return (await this.findOne(task.id, userId))!;
  }

  private async breakdownAndCreateTasks(
    createTaskDto: CreateTaskDto,
    project: Project,
    userId: string
  ): Promise<Task[]> {
    const { projectId, useAiEstimate, breakdown, ...taskData } = createTaskDto;

    // 1. Создаём родительский таск без AI estimate
    const parentTask = this.taskRepository.create({
      ...taskData,
      project: { id: projectId } as any,
    });
    const parentTaskSaved = await this.taskRepository.save(parentTask);

    const createdSubtasks: Task[] = [];
    let totalEstimate = 0;
    let subtaskItems: Subtask[] = [];
    const confidenceScores: number[] = [];

    // 3. Create subtasks if breakdown is requested
    if (createTaskDto.breakdown) {
      subtaskItems = await this.aiEstimatorService.breakdownTask(
        createTaskDto,
        project
      );

      for (const subtaskData of subtaskItems) {
        const subtaskDto: CreateTaskDto = {
          ...createTaskDto,
          title: subtaskData.title,
          description: subtaskData.description,
          breakdown: false,
          manualEstimate: undefined,
        };

        const subtaskEstimate = await this.aiEstimatorService.estimateTask(
          subtaskDto,
          project
        );

        const subtask = this.taskRepository.create({
          title: subtaskDto.title,
          description: subtaskDto.description,
          technology: subtaskDto.technology,
          experienceLevel: subtaskDto.experienceLevel,
          tags: subtaskDto.tags,
          project: { id: project.id },
          parentTask: { id: parentTaskSaved.id },
        });
        await this.taskRepository.save(subtask);

        await this.estimatesService.create({
          ...subtaskEstimate,
          taskId: subtask.id,
        });

        createdSubtasks.push((await this.findOne(subtask.id, userId))!);
        totalEstimate += subtaskEstimate.finalEstimate;
        if (subtaskEstimate.confidence) {
          confidenceScores.push(subtaskEstimate.confidence);
        }
      }
    }

    // 4. Update parent task's estimate if subtasks were created
    if (totalEstimate > 0) {
      const averageConfidence = confidenceScores.length
        ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
        : undefined;

      const estimateDto: CreateEstimateDto = {
        taskId: parentTaskSaved.id,
        finalEstimate: totalEstimate,
        confidence: averageConfidence,
        source: EstimateSource.AI_SUBTASK_SUM,
        explanation: `Sum of ${subtaskItems.length} AI-estimated subtasks`,
      };
      await this.estimatesService.create(estimateDto);
    }

    const resultTask = await this.findOne(parentTask.id, userId);
    return [resultTask, ...createdSubtasks];
  }

  private async getTaskAndCheckPermissions(
    id: string,
    userId: string
  ): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: ['project', 'estimates', 'feedbacks', 'parentTask'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID "${id}" not found`);
    }

    if (task.project.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this task.'
      );
    }

    return task;
  }

  async findOne(id: string, userId: string): Promise<Task> {
    return this.getTaskAndCheckPermissions(id, userId);
  }

  async update(
    id: string,
    updateTaskDto: UpdateTaskDto,
    userId: string
  ): Promise<Task> {
    const task = await this.getTaskAndCheckPermissions(id, userId);
    const { manualEstimate, ...taskData } = updateTaskDto;

    if (manualEstimate) {
      await this.estimatesService.createOrUpdateManualEstimate(
        id,
        manualEstimate
      );
    }

    if (Object.keys(taskData).length > 0) {
      await this.taskRepository.update(id, taskData);
    }

    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const task = await this.findOne(id, userId);
    await this.taskRepository.delete(id);
  }
}
