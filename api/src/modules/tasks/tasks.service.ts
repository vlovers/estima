import { AiEstimatorService } from '../ai-estimator/ai-estimator.service';
import { EstimateSource } from '../estimates/entities/estimate.entity';
import { EstimatesService } from '../estimates/estimates.service';
import { ProjectsService } from '../projects/projects.service';
import { UpdateTaskDto } from './dto/update-task.dto';
import {
  CreateTaskDto,
  NfrCategory,
  IntegrationType,
  IntegrationInteraction,
  IntegrationAuth,
  UiDesignComplexity,
  MigrationComplexity,
  ComplexityTag,
} from './dto/create-task.dto';
import { ClarifyTaskDto } from './dto/clarify-task.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { TaskStatus } from './entities/task.entity';
import { Task } from './entities/task.entity';
import { EntityManager, Repository } from 'typeorm';

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

    // An explicit opt-out must not depend on provider credentials or quota.
    // Omitted flags retain the existing behavior for older API clients.
    if (createTaskDto.useAiEstimate === false) {
      if (
        typeof createTaskDto.manualEstimate !== 'number' ||
        !Number.isFinite(createTaskDto.manualEstimate) ||
        createTaskDto.manualEstimate <= 0
      ) {
        throw new BadRequestException(
          'Manual-only tasks require a positive manual estimate.'
        );
      }
      return this.taskRepository.manager.transaction(async (manager) => {
        const task = manager.getRepository(Task).create({
          title: createTaskDto.title,
          description: createTaskDto.description,
          technology: createTaskDto.technology,
          experienceLevel: createTaskDto.experienceLevel,
          tags: createTaskDto.tags,
          breakdown: createTaskDto.breakdown ?? true,
          acceptanceCriteria: createTaskDto.acceptanceCriteria ?? [],
          assumptions: createTaskDto.assumptions ?? [],
          constraints: createTaskDto.constraints ?? [],
          nfrs: createTaskDto.nfrs ?? [],
          integrations: createTaskDto.integrations ?? [],
          testing: createTaskDto.testing ?? null,
          documentation: createTaskDto.documentation ?? null,
          complexityTags: createTaskDto.complexityTags ?? [],
          uiDesignComplexity: createTaskDto.uiDesignComplexity ?? null,
          needsDataMigration: createTaskDto.needsDataMigration ?? false,
          migrationComplexity: createTaskDto.migrationComplexity ?? null,
          project: { id: project.id },
          status: TaskStatus.ESTIMATED,
        });
        await this.insertTask(task, manager);
        if (createTaskDto.manualEstimate !== undefined) {
          await this.estimatesService.createOrUpdateManualEstimate(
            task.id,
            createTaskDto.manualEstimate,
            userId,
            manager
          );
        }
        return this.getTaskAndCheckPermissions(task.id, userId, manager);
      });
    }

    const analysis = await this.aiEstimatorService.createInitialAnalysis(
      createTaskDto,
      project
    );

    if (analysis.type === 'questions') {
      // AI returned questions, so create a task pending clarification
      const task = this.taskRepository.create({
        title: createTaskDto.title,
        description: createTaskDto.description,
        technology: createTaskDto.technology,
        experienceLevel: createTaskDto.experienceLevel,
        tags: createTaskDto.tags,
        breakdown: createTaskDto.breakdown ?? true,
        // Persist structured fields
        acceptanceCriteria: createTaskDto.acceptanceCriteria ?? [],
        assumptions: createTaskDto.assumptions ?? [],
        constraints: createTaskDto.constraints ?? [],
        nfrs: createTaskDto.nfrs ?? [],
        integrations: createTaskDto.integrations ?? [],
        testing: createTaskDto.testing ?? null,
        documentation: createTaskDto.documentation ?? null,
        complexityTags: createTaskDto.complexityTags ?? [],
        uiDesignComplexity: createTaskDto.uiDesignComplexity ?? null,
        needsDataMigration: createTaskDto.needsDataMigration ?? false,
        migrationComplexity: createTaskDto.migrationComplexity ?? null,
        project: { id: project.id },
        status: TaskStatus.PENDING_CLARIFICATION,
        clarificationHistory: analysis.data.questions.map((q) => ({
          question: q,
          answer: '',
        })),
      });
      const savedTask = await this.insertTask(task);
      // Return the full task object to ensure relations are loaded
      return this.findOne(savedTask.id, userId);
    }

    // AI returned a full estimate, create the parent task, subtasks, and estimates
    const { subtasks, risks, ...estimationData } = analysis.data;
    const breakdown = createTaskDto.breakdown ?? true;

    const totalEstimate = subtasks.reduce(
      (sum, subtask) => sum + subtask.estimateHours,
      0
    );
    // Provider requests and calibration reads finish before opening the write transaction.
    const calibrated = await this.aiEstimatorService.computeCalibratedEstimate({
      totalBottomUp: totalEstimate,
      subtasksCount: subtasks.length,
      taskDto: createTaskDto,
      project,
      risksCount: risks?.length ?? 0,
    });
    return this.taskRepository.manager.transaction(async (manager) => {
      const taskRepository = manager.getRepository(Task);
      // 1. Create the parent task
      const parentTask = taskRepository.create({
        title: createTaskDto.title,
        description: createTaskDto.description,
        technology: createTaskDto.technology,
        experienceLevel: createTaskDto.experienceLevel,
        tags: createTaskDto.tags,
        breakdown, // Save the breakdown preference
        // Persist structured fields on parent task
        acceptanceCriteria: createTaskDto.acceptanceCriteria ?? [],
        assumptions: createTaskDto.assumptions ?? [],
        constraints: createTaskDto.constraints ?? [],
        nfrs: createTaskDto.nfrs ?? [],
        integrations: createTaskDto.integrations ?? [],
        testing: createTaskDto.testing ?? null,
        documentation: createTaskDto.documentation ?? null,
        complexityTags: createTaskDto.complexityTags ?? [],
        uiDesignComplexity: createTaskDto.uiDesignComplexity ?? null,
        needsDataMigration: createTaskDto.needsDataMigration ?? false,
        migrationComplexity: createTaskDto.migrationComplexity ?? null,
        project: { id: project.id },
        riskAnalysis: risks,
        status: TaskStatus.ESTIMATED,
      });
      await this.insertTask(parentTask, manager);

      // 2. Create subtasks and their individual estimates or a single aggregate estimate
      let totalConfidence = 0;

      if (breakdown) {
        for (const subtaskData of subtasks) {
          const subtask = taskRepository.create({
            title: subtaskData.title,
            description: subtaskData.description,
            project: { id: project.id },
            parentTask: { id: parentTask.id },
            status: TaskStatus.ESTIMATED,
            // Inherit other properties from parent DTO
            technology: createTaskDto.technology,
            experienceLevel: createTaskDto.experienceLevel,
          });
          await this.insertTask(subtask, manager);

          const confidence = this.calculateConfidence(subtaskData.description);
          totalConfidence += confidence;

          await this.estimatesService.create(
            {
              taskId: subtask.id,
              finalEstimate: subtaskData.estimateHours,
              source: EstimateSource.AI,
              explanation: subtaskData.explanation,
              confidence,
            },
            userId,
            manager
          );
        }

        // 3a. Create the aggregate estimate for the parent task (subtask sum)
        if (totalEstimate > 0) {
          await this.estimatesService.create(
            {
              taskId: parentTask.id,
              finalEstimate: totalEstimate,
              source: EstimateSource.AI_SUBTASK_SUM,
              explanation: `Sum of ${subtasks.length} AI-estimated subtasks.`,
              confidence:
                subtasks.length > 0 ? totalConfidence / subtasks.length : 0,
              managerExplanation: estimationData.managerNote,
              manualEstimate: createTaskDto.manualEstimate,
            },
            userId,
            manager
          );
        }

        // 3b. Persist the FINAL estimate computed before this transaction.
        await this.estimatesService.create(
          {
            taskId: parentTask.id,
            finalEstimate: calibrated.p50,
            source: EstimateSource.FINAL,
            confidence: calibrated.confidence,
            explanation: `${
              calibrated.explanation
            }\nRange: p10=${calibrated.p10.toFixed(
              1
            )}h, p50=${calibrated.p50.toFixed(
              1
            )}h, p90=${calibrated.p90.toFixed(
              1
            )}h\nLogs:\n- ${calibrated.logs.join('\n- ')}`,
            managerExplanation: estimationData.managerNote,
            manualEstimate: createTaskDto.manualEstimate,
            p10: calibrated.p10,
            p50: calibrated.p50,
            p90: calibrated.p90,
            topDown: calibrated.topDown,
            bottomUp: calibrated.bottomUp,
            divergencePct: calibrated.divergencePct,
            logs: calibrated.logs.join('\n'),
          },
          userId,
          manager
        );
      } else {
        // 3a. Create a single, non-broken-down estimate for the parent task (raw AI sum)
        if (totalEstimate > 0) {
          const confidence =
            subtasks.length > 0 ? totalConfidence / subtasks.length : 0;
          await this.estimatesService.create(
            {
              taskId: parentTask.id,
              finalEstimate: totalEstimate,
              source: EstimateSource.AI,
              explanation: 'AI-generated estimate without task breakdown.',
              confidence,
              managerExplanation: estimationData.managerNote, // Correctly map managerNote
              manualEstimate: createTaskDto.manualEstimate,
            },
            userId,
            manager
          );
        }

        // 3b. Persist the FINAL estimate computed before this transaction.
        await this.estimatesService.create(
          {
            taskId: parentTask.id,
            finalEstimate: calibrated.p50,
            source: EstimateSource.FINAL,
            confidence: calibrated.confidence,
            explanation: `${
              calibrated.explanation
            }\nRange: p10=${calibrated.p10.toFixed(
              1
            )}h, p50=${calibrated.p50.toFixed(
              1
            )}h, p90=${calibrated.p90.toFixed(
              1
            )}h\nLogs:\n- ${calibrated.logs.join('\n- ')}`,
            managerExplanation: estimationData.managerNote,
            manualEstimate: createTaskDto.manualEstimate,
            p10: calibrated.p10,
            p50: calibrated.p50,
            p90: calibrated.p90,
            topDown: calibrated.topDown,
            bottomUp: calibrated.bottomUp,
            divergencePct: calibrated.divergencePct,
            logs: calibrated.logs.join('\n'),
          },
          userId,
          manager
        );
      }

      // 4. Return the fully populated parent task
      return this.getTaskAndCheckPermissions(parentTask.id, userId, manager);
    });
  }

  private async getTaskAndCheckPermissions(
    id: string,
    userId: string,
    manager?: EntityManager
  ): Promise<Task> {
    const task = await (
      manager?.getRepository(Task) ?? this.taskRepository
    ).findOne({
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
    return this.taskRepository.manager.transaction(async (manager) => {
      const task = await this.getTaskAndCheckPermissions(id, userId, manager);
      const { manualEstimate } = updateTaskDto;
      if (
        updateTaskDto.projectId &&
        updateTaskDto.projectId !== task.project.id
      ) {
        throw new BadRequestException(
          'Task project cannot be changed through this endpoint.'
        );
      }
      // Request-only AI flags are accepted by the DTO but are not entity columns.
      const taskData = {
        title: updateTaskDto.title,
        description: updateTaskDto.description,
        technology: updateTaskDto.technology,
        experienceLevel: updateTaskDto.experienceLevel,
        tags: updateTaskDto.tags,
        breakdown: updateTaskDto.breakdown,
        acceptanceCriteria: updateTaskDto.acceptanceCriteria,
        assumptions: updateTaskDto.assumptions,
        constraints: updateTaskDto.constraints,
        nfrs: updateTaskDto.nfrs,
        integrations: updateTaskDto.integrations,
        testing: updateTaskDto.testing,
        documentation: updateTaskDto.documentation,
        complexityTags: updateTaskDto.complexityTags,
        uiDesignComplexity: updateTaskDto.uiDesignComplexity,
        needsDataMigration: updateTaskDto.needsDataMigration,
        migrationComplexity: updateTaskDto.migrationComplexity,
      };

      if (manualEstimate !== undefined) {
        await this.estimatesService.createOrUpdateManualEstimate(
          id,
          manualEstimate,
          userId,
          manager
        );
      }

      if (Object.values(taskData).some((value) => value !== undefined)) {
        await manager.getRepository(Task).update(id, taskData);
      }

      return this.getTaskAndCheckPermissions(id, userId, manager);
    });
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
    const reconstructedDto: CreateTaskDto = {
      projectId: project.id,
      title: task.title,
      description: task.description ?? '',
      technology: task.technology ?? '',
      experienceLevel: task.experienceLevel,
      tags: task.tags ?? [],
      acceptanceCriteria: task.acceptanceCriteria ?? [],
      assumptions: task.assumptions ?? [],
      constraints: task.constraints ?? [],
      nfrs: (task.nfrs ?? []).map((n) => ({
        category: (n.category as unknown) as NfrCategory,
        requirement: n.requirement,
        target: n.target,
      })),
      integrations: (task.integrations ?? []).map((i) => ({
        name: i.name,
        type: (i.type as unknown) as IntegrationType,
        interaction: (i.interaction as unknown) as IntegrationInteraction,
        auth: (i.auth as unknown) as IntegrationAuth,
        sandbox: i.sandbox,
      })),
      testing: task.testing ?? undefined,
      documentation: task.documentation ?? undefined,
      complexityTags: ((task.complexityTags ?? []) as unknown) as ComplexityTag[],
      uiDesignComplexity: (task.uiDesignComplexity as unknown) as UiDesignComplexity,
      needsDataMigration: task.needsDataMigration ?? false,
      migrationComplexity: (task.migrationComplexity as unknown) as MigrationComplexity,
      breakdown: task.breakdown,
    };

    const analysis = await this.aiEstimatorService.getAiAnalysis(
      reconstructedDto,
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
        await this.insertTask(subtask);

        const confidence = this.calculateConfidence(subtaskData.description);
        totalConfidence += confidence;

        await this.estimatesService.create(
          {
            taskId: subtask.id,
            finalEstimate: subtaskData.estimateHours,
            source: EstimateSource.AI,
            explanation: subtaskData.explanation,
            confidence,
          },
          userId
        );
      }

      // Create the aggregate estimate for the parent task
      if (totalEstimate > 0) {
        await this.estimatesService.create(
          {
            taskId: task.id,
            finalEstimate: totalEstimate,
            source: EstimateSource.AI_SUBTASK_SUM,
            explanation: `Sum of ${subtasks.length} AI-estimated subtasks after clarification.`,
            confidence:
              subtasks.length > 0 ? totalConfidence / subtasks.length : 0,
          },
          userId
        );
      }

      // And the calibrated FINAL estimate
      const calibrated =
        await this.aiEstimatorService.computeCalibratedEstimate({
          totalBottomUp: totalEstimate,
          subtasksCount: subtasks.length,
          taskDto: task as any,
          project,
          risksCount: risks?.length ?? 0,
        });
      await this.estimatesService.create(
        {
          taskId: task.id,
          finalEstimate: calibrated.p50,
          source: EstimateSource.FINAL,
          confidence: calibrated.confidence,
          explanation: `${
            calibrated.explanation
          }\nRange: p10=${calibrated.p10.toFixed(
            1
          )}h, p50=${calibrated.p50.toFixed(1)}h, p90=${calibrated.p90.toFixed(
            1
          )}h\nLogs:\n- ${calibrated.logs.join('\n- ')}`,
        },
        userId
      );
    } else {
      // Create a single, non-broken-down estimate for the parent task
      if (totalEstimate > 0) {
        const confidence =
          subtasks.length > 0 ? totalConfidence / subtasks.length : 0;
        await this.estimatesService.create(
          {
            taskId: task.id,
            finalEstimate: totalEstimate,
            source: EstimateSource.AI,
            explanation:
              'AI-generated estimate after clarification, without task breakdown.',
            confidence,
          },
          userId
        );
      }

      // And the calibrated FINAL estimate
      const calibrated =
        await this.aiEstimatorService.computeCalibratedEstimate({
          totalBottomUp: totalEstimate,
          subtasksCount: subtasks.length,
          taskDto: task as any,
          project,
          risksCount: risks?.length ?? 0,
        });
      await this.estimatesService.create(
        {
          taskId: task.id,
          finalEstimate: calibrated.p50,
          source: EstimateSource.FINAL,
          confidence: calibrated.confidence,
          explanation: `${
            calibrated.explanation
          }\nRange: p10=${calibrated.p10.toFixed(
            1
          )}h, p50=${calibrated.p50.toFixed(1)}h, p90=${calibrated.p90.toFixed(
            1
          )}h\nLogs:\n- ${calibrated.logs.join('\n- ')}`,
        },
        userId
      );
    }

    return this.findOne(id, userId);
  }

  private async insertTask(task: Task, manager?: EntityManager): Promise<Task> {
    const inserted = await (
      manager?.getRepository(Task) ?? this.taskRepository
    ).insert(task);
    task.id = inserted.identifiers[0].id;
    return task;
  }

  private calculateConfidence(description: string): number {
    const length = description?.length ?? 0;
    if (length > 200) return 0.95;
    if (length > 100) return 0.85;
    if (length > 50) return 0.75;
    return 0.6;
  }
}
