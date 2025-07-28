import { AiEstimatorService } from '../ai-estimator/ai-estimator.service';
import { EstimateSource } from '../estimates/entities/estimate.entity';
import { EstimatesService } from '../estimates/estimates.service';
import { ProjectsService } from '../projects/projects.service';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ClarifyTaskDto } from './dto/clarify-task.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { TaskStatus } from './entities/task.entity';
import { Task } from './entities/task.entity';
import { Repository } from 'typeorm';

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Injectable,
  Logger,
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

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<Task> {
    const project = await this.projectsService.findOne(
      createTaskDto.projectId,
      userId
    );

    const analysis = await this.aiEstimatorService.createInitialAnalysis(
      createTaskDto,
      project
    );

    if (analysis.type === 'questions') {
      // AI returned questions, so create a task pending clarification
      const task = this.taskRepository.create({
        ...createTaskDto,
        project: { id: project.id },
        status: TaskStatus.PENDING_CLARIFICATION,
        clarificationHistory: analysis.data.questions.map((q) => ({
          question: q,
          answer: '',
        })),
      });
      const savedTask = await this.taskRepository.save(task);
      // Return the full task object to ensure relations are loaded
      return this.findOne(savedTask.id, userId);
    }

    // AI returned a full estimate, create the parent task, subtasks, and estimates
    const { subtasks, risks, ...estimationData } = analysis.data;
    const breakdown = createTaskDto.breakdown ?? true;

    // 1. Create the parent task
    const parentTask = this.taskRepository.create({
      ...createTaskDto,
      breakdown, // Save the breakdown preference
      project: { id: project.id },
      riskAnalysis: risks,
      status: TaskStatus.ESTIMATED,
    });
    await this.taskRepository.save(parentTask);

    // 2. Create subtasks and their individual estimates or a single aggregate estimate
    const totalEstimate = subtasks.reduce(
      (sum, subtask) => sum + subtask.estimateHours,
      0
    );
    let totalConfidence = 0;

    if (breakdown) {
      for (const subtaskData of subtasks) {
        const subtask = this.taskRepository.create({
          title: subtaskData.title,
          description: subtaskData.description,
          project: { id: project.id },
          parentTask: { id: parentTask.id },
          status: TaskStatus.ESTIMATED,
          // Inherit other properties from parent DTO
          technology: createTaskDto.technology,
          experienceLevel: createTaskDto.experienceLevel,
        });
        await this.taskRepository.save(subtask);

        const confidence = this.calculateConfidence(subtaskData.description);
        totalConfidence += confidence;

        await this.estimatesService.create({
          taskId: subtask.id,
          finalEstimate: subtaskData.estimateHours,
          source: EstimateSource.AI,
          explanation: subtaskData.explanation,
          confidence,
        });
      }

      // 3. Create the aggregate estimate for the parent task
      if (totalEstimate > 0) {
        await this.estimatesService.create({
          taskId: parentTask.id,
          finalEstimate: totalEstimate,
          source: EstimateSource.AI_SUBTASK_SUM,
          explanation: `Sum of ${subtasks.length} AI-estimated subtasks.`,
          confidence:
            subtasks.length > 0 ? totalConfidence / subtasks.length : 0,
          managerExplanation: estimationData.managerNote,
          manualEstimate: createTaskDto.manualEstimate,
        });
      }
    } else {
      // 3. Create a single, non-broken-down estimate for the parent task
      if (totalEstimate > 0) {
        const confidence =
          subtasks.length > 0 ? totalConfidence / subtasks.length : 0;
        await this.estimatesService.create({
          taskId: parentTask.id,
          finalEstimate: totalEstimate,
          source: EstimateSource.AI,
          explanation: 'AI-generated estimate without task breakdown.',
          confidence,
          managerExplanation: estimationData.managerNote, // Correctly map managerNote
          manualEstimate: createTaskDto.manualEstimate,
        });
      }
    }

    // 4. Return the fully populated parent task
    return this.findOne(parentTask.id, userId);
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

  async clarify(
    id: string,
    clarifyDto: ClarifyTaskDto,
    userId: string
  ): Promise<Task> {
    const task = await this.getTaskAndCheckPermissions(id, userId);

    if (task.status !== TaskStatus.PENDING_CLARIFICATION) {
      throw new BadRequestException(
        'This task is not pending clarification and cannot be updated with answers.'
      );
    }

    // Update clarification history with answers
    clarifyDto.clarifications.forEach((c) => {
      const historyItem = task.clarificationHistory.find(
        (h) => h.question === c.question
      );
      if (historyItem) {
        historyItem.answer = c.answer;
      }
    });

    // Persist the answers before re-estimating
    await this.taskRepository.save(task);

    // 2. Re-run the estimation with the new information
    const project = await this.projectsService.findOne(task.project.id, userId);

    // Re-run AI analysis with the new context
    const analysis = await this.aiEstimatorService.getAiAnalysis(
      { ...task, projectId: project.id }, // Re-construct DTO
      project,
      task.clarificationHistory // Pass the history explicitly
    );

    if (analysis.type === 'questions') {
      // If AI still has questions, append them to the history and let the user try again
      const newQuestions = analysis.data.questions.map((q) => ({
        question: q,
        answer: '',
      }));
      task.clarificationHistory.push(...newQuestions);
      // We don't throw an error, just save and return the task with PENDING status.
      // The frontend will handle the display.
      return this.taskRepository.save(task);
    }

    // AI returned a full estimate, update the task
    const { subtasks, risks } = analysis.data;
    task.status = TaskStatus.ESTIMATED;
    task.riskAnalysis = risks;
    await this.taskRepository.save(task);

    // Create subtasks and estimates based on the original breakdown flag
    const totalEstimate = subtasks.reduce(
      (sum, subtask) => sum + subtask.estimateHours,
      0
    );
    let totalConfidence = 0;

    if (task.breakdown) {
      for (const subtaskData of subtasks) {
        const subtask = this.taskRepository.create({
          title: subtaskData.title,
          description: subtaskData.description,
          project: { id: project.id },
          parentTask: { id: task.id },
          status: TaskStatus.ESTIMATED,
          technology: task.technology,
          experienceLevel: task.experienceLevel,
        });
        await this.taskRepository.save(subtask);

        const confidence = this.calculateConfidence(subtaskData.description);
        totalConfidence += confidence;

        await this.estimatesService.create({
          taskId: subtask.id,
          finalEstimate: subtaskData.estimateHours,
          source: EstimateSource.AI,
          explanation: subtaskData.explanation,
          confidence,
        });
      }

      // Create the aggregate estimate for the parent task
      if (totalEstimate > 0) {
        await this.estimatesService.create({
          taskId: task.id,
          finalEstimate: totalEstimate,
          source: EstimateSource.AI_SUBTASK_SUM,
          explanation: `Sum of ${subtasks.length} AI-estimated subtasks after clarification.`,
          confidence:
            subtasks.length > 0 ? totalConfidence / subtasks.length : 0,
        });
      }
    } else {
      // Create a single, non-broken-down estimate for the parent task
      if (totalEstimate > 0) {
        const confidence =
          subtasks.length > 0 ? totalConfidence / subtasks.length : 0;
        await this.estimatesService.create({
          taskId: task.id,
          finalEstimate: totalEstimate,
          source: EstimateSource.AI,
          explanation:
            'AI-generated estimate after clarification, without task breakdown.',
          confidence,
        });
      }
    }

    return this.findOne(id, userId);
  }

  private calculateConfidence(description: string): number {
    const length = description?.length ?? 0;
    if (length > 200) return 0.95;
    if (length > 100) return 0.85;
    if (length > 50) return 0.75;
    return 0.6;
  }
}
