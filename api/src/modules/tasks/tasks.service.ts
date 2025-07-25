import { AiEstimatorService } from '../ai-estimator/ai-estimator.service';
import { EstimateSource } from '../estimates/entities/estimate.entity';
import { EstimatesService } from '../estimates/estimates.service';
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
} from '@nestjs/common';

@Injectable()
export class TasksService {
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

    return this.createSingleTask(createTaskDto, project, userId);
  }

  private async createSingleTask(
    createTaskDto: CreateTaskDto,
    project: Project,
    userId: string
  ): Promise<Task> {
    const { projectId, useAiEstimate, breakdown, ...taskData } = createTaskDto;

    const task = this.taskRepository.create({
      ...taskData,
      project: { id: projectId } as any,
    });
    await this.taskRepository.save(task);

    if (createTaskDto.useAiEstimate) {
      const aiEstimate = await this.aiEstimatorService.estimateTask(
        createTaskDto,
        project
      );

      await this.estimatesService.create({
        finalEstimate: aiEstimate.finalEstimate,
        confidence: aiEstimate.confidence,
        explanation: aiEstimate.explanation,
        source: EstimateSource.AI,
        taskId: task.id,
      });
    }

    return (await this.findOne(task.id, userId))!;
  }

  private async breakdownAndCreateTasks(
    createTaskDto: CreateTaskDto,
    project: Project,
    userId: string
  ): Promise<Task[]> {
    const { projectId, useAiEstimate, breakdown, ...taskData } = createTaskDto;

    const parentTask = this.taskRepository.create({
      ...taskData,
      project: { id: projectId } as any,
    });
    await this.taskRepository.save(parentTask);

    const subtaskDtos = await this.aiEstimatorService.breakdownTask(
      createTaskDto,
      project
    );

    const createdSubtasks: Task[] = [];
    let totalEstimate = 0;

    for (const subtaskDto of subtaskDtos) {
      const subtask = this.taskRepository.create({
        title: subtaskDto.title,
        description: subtaskDto.description,
        parentTask: parentTask,
        project: { id: projectId } as any,
        technology: createTaskDto.technology,
        experienceLevel: createTaskDto.experienceLevel,
        tags: createTaskDto.tags,
      });
      await this.taskRepository.save(subtask);

      totalEstimate += subtaskDto.estimateHours;

      await this.estimatesService.create({
        finalEstimate: subtaskDto.estimateHours,
        source: EstimateSource.AI,
        taskId: subtask.id,
        // Confidence is not provided by the breakdown endpoint, can be added later
      });

      createdSubtasks.push((await this.findOne(subtask.id, userId))!);
    }

    if (totalEstimate > 0) {
      await this.estimatesService.create({
        finalEstimate: totalEstimate,
        source: EstimateSource.AI,
        taskId: parentTask.id,
        // Explanation could be added later for rollup
      });
    }

    return createdSubtasks;
  }

  private async getTaskAndCheckPermissions(
    id: string,
    userId: string
  ): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: ['project'],
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
    await this.taskRepository.update(id, updateTaskDto);
    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const task = await this.findOne(id, userId);
    await this.taskRepository.delete(id);
  }
}
