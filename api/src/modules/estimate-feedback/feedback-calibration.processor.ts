import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { CoefficientChangeEvent } from '../calibration/entities/coefficient-change-event.entity';
import { Coefficient } from '../calibration/entities/coefficient.entity';
import { TenantCalibrationCoefficient } from '../calibration/entities/tenant-calibration-coefficient.entity';
import { Estimate, EstimateSource } from '../estimates/entities/estimate.entity';
import { Project } from '../projects/entities/project.entity';
import { Task } from '../tasks/entities/task.entity';
import {
  EstimateFeedback,
  FeedbackProcessingStatus,
} from './entities/estimate-feedback.entity';
import {
  FeedbackCalibrationPolicyResult,
  NoLearningFeedbackCalibrationPolicy,
} from './feedback-calibration-policy';

export type FeedbackProcessingOptions = {
  failAfterCoefficientLocks?: boolean;
};

type OwnedTaskContext = {
  task: Task;
  project: Project;
  tenantUserId: string;
};

const TERMINAL_STATUSES = new Set<FeedbackProcessingStatus>([
  FeedbackProcessingStatus.PROCESSED,
  FeedbackProcessingStatus.SKIPPED,
]);

@Injectable()
export class FeedbackCalibrationProcessor {
  private readonly logger = new Logger(FeedbackCalibrationProcessor.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly policy: NoLearningFeedbackCalibrationPolicy
  ) {}

  async processFeedback(
    feedbackId: string,
    options: FeedbackProcessingOptions = {}
  ): Promise<EstimateFeedback> {
    try {
      return await this.dataSource.transaction(
        'READ COMMITTED',
        async (manager) =>
          this.processFeedbackInTransaction(manager, feedbackId, options)
      );
    } catch (error) {
      await this.markFeedbackFailed(feedbackId, error);
      throw error;
    }
  }

  private async processFeedbackInTransaction(
    manager: EntityManager,
    feedbackId: string,
    options: FeedbackProcessingOptions
  ): Promise<EstimateFeedback> {
    const feedback = await manager
      .getRepository(EstimateFeedback)
      .createQueryBuilder('feedback')
      .setLock('pessimistic_write')
      .where('feedback.id = :feedbackId', { feedbackId })
      .getOne();

    if (!feedback) {
      throw new NotFoundException(`Feedback with id ${feedbackId} not found`);
    }

    if (TERMINAL_STATUSES.has(feedback.processingStatus)) {
      return feedback;
    }

    const { task, project, tenantUserId } = await this.resolveTenantContext(
      manager,
      feedback
    );
    await this.validateFeedbackEstimate(manager, feedback, task);

    if (!this.hasValidSnapshot(feedback)) {
      return this.markSkipped(
        manager,
        feedback,
        'invalid_estimated_hours_snapshot',
        'no-learning-pr3.3'
      );
    }

    const targetCoefficientKeys = this.resolveTargetCoefficientKeys(
      task,
      project,
      feedback
    );

    if (targetCoefficientKeys.length === 0) {
      return this.markSkipped(
        manager,
        feedback,
        'no_target_coefficients',
        'no-learning-pr3.3'
      );
    }

    const coefficients = await this.ensureAndLockTenantCoefficients(
      manager,
      tenantUserId,
      targetCoefficientKeys
    );

    if (options.failAfterCoefficientLocks) {
      throw new Error('Injected feedback calibration failure');
    }

    const policyResult = await this.policy.evaluate({
      feedback,
      tenantUserId,
      targetCoefficientKeys,
      coefficients,
    });

    return this.applyPolicyResult(
      manager,
      feedback,
      tenantUserId,
      policyResult,
      coefficients
    );
  }

  private async resolveTenantContext(
    manager: EntityManager,
    feedback: EstimateFeedback
  ): Promise<OwnedTaskContext> {
    const task = await manager
      .getRepository(Task)
      .createQueryBuilder('task')
      .innerJoinAndSelect('task.project', 'project')
      .where('task.id = :taskId', { taskId: feedback.taskId })
      .getOne();

    if (!task || !task.project?.userId) {
      throw new Error(`Feedback ${feedback.id} does not resolve to a tenant`);
    }

    return {
      task,
      project: task.project,
      tenantUserId: task.project.userId,
    };
  }

  private async validateFeedbackEstimate(
    manager: EntityManager,
    feedback: EstimateFeedback,
    task: Task
  ): Promise<void> {
    if (!feedback.estimateId) {
      return;
    }

    const estimate = await manager
      .getRepository(Estimate)
      .createQueryBuilder('estimate')
      .innerJoin('estimate.task', 'task')
      .innerJoin('task.project', 'project')
      .where('estimate.id = :estimateId', { estimateId: feedback.estimateId })
      .andWhere('task.id = :taskId', { taskId: task.id })
      .andWhere('project.id = :projectId', { projectId: task.project.id })
      .andWhere('estimate.source = :source', { source: EstimateSource.FINAL })
      .getOne();

    if (!estimate) {
      throw new Error(
        `Feedback ${feedback.id} references an invalid or cross-tenant estimate`
      );
    }
  }

  private hasValidSnapshot(feedback: EstimateFeedback): boolean {
    return (
      typeof feedback.estimatedHoursSnapshot === 'number' &&
      Number.isFinite(feedback.estimatedHoursSnapshot) &&
      feedback.estimatedHoursSnapshot > 0
    );
  }

  private resolveTargetCoefficientKeys(
    task: Task,
    project: Project,
    feedback: EstimateFeedback
  ): string[] {
    const keys = new Set<string>();

    if (task.experienceLevel) {
      keys.add(`experience.${task.experienceLevel}`);
    }

    if (project.complexity) {
      keys.add(`project.complexity.${project.complexity}`);
    }

    for (const tag of task.complexityTags || []) {
      keys.add(`complexity.${tag}`);
    }

    for (const tag of feedback.missedComplexityTags || []) {
      keys.add(`complexity.${tag}`);
    }

    return [...keys].filter(Boolean).sort();
  }

  private async ensureAndLockTenantCoefficients(
    manager: EntityManager,
    tenantUserId: string,
    keys: string[]
  ): Promise<TenantCalibrationCoefficient[]> {
    const sortedKeys = [...new Set(keys)].sort();
    const defaultValues = await this.loadDefaultValues(manager, sortedKeys);

    for (const key of sortedKeys) {
      const defaultValue = defaultValues.get(key) ?? 1;
      await manager
        .createQueryBuilder()
        .insert()
        .into(TenantCalibrationCoefficient)
        .values({
          tenantUserId,
          key,
          value: defaultValue,
          defaultValue,
          minValue: 0.5,
          maxValue: 2,
          eligibleSampleCount: 0,
          totalWeight: 0,
          ewmaLogError: 0,
          version: 1,
        })
        .orIgnore()
        .execute();
    }

    const coefficients = await manager
      .getRepository(TenantCalibrationCoefficient)
      .createQueryBuilder('coefficient')
      .setLock('pessimistic_write')
      .where('coefficient."tenantUserId" = :tenantUserId', { tenantUserId })
      .andWhere('coefficient.key IN (:...keys)', { keys: sortedKeys })
      .orderBy('coefficient.key', 'ASC')
      .getMany();

    if (coefficients.length !== sortedKeys.length) {
      throw new Error('Unable to initialize all tenant calibration rows');
    }

    return coefficients;
  }

  private async loadDefaultValues(
    manager: EntityManager,
    keys: string[]
  ): Promise<Map<string, number>> {
    const coefficients = await manager.getRepository(Coefficient).find({
      where: { key: In(keys) },
    });

    return new Map(
      coefficients
        .filter((coefficient) => Number.isFinite(coefficient.value))
        .map((coefficient) => [coefficient.key, coefficient.value])
    );
  }

  private async applyPolicyResult(
    manager: EntityManager,
    feedback: EstimateFeedback,
    tenantUserId: string,
    policyResult: FeedbackCalibrationPolicyResult,
    lockedCoefficients?: TenantCalibrationCoefficient[]
  ): Promise<EstimateFeedback> {
    if (policyResult.skipReason) {
      return this.markSkipped(
        manager,
        feedback,
        policyResult.skipReason,
        policyResult.algorithmVersion
      );
    }

    if (policyResult.mutations.length === 0) {
      return this.markSkipped(
        manager,
        feedback,
        'no_coefficient_changes',
        policyResult.algorithmVersion
      );
    }

    const coefficientRepository = manager.getRepository(
      TenantCalibrationCoefficient
    );
    const eventRepository = manager.getRepository(CoefficientChangeEvent);
    const lockedByKey = new Map(
      (lockedCoefficients ?? []).map((coefficient) => [
        coefficient.key,
        coefficient,
      ])
    );
    let appliedMutations = 0;

    for (const mutation of policyResult.mutations) {
      if (mutation.oldValue === mutation.newValue) {
        continue;
      }

      const coefficient = lockedByKey.get(mutation.coefficientKey);
      if (!coefficient) {
        throw new Error(
          `Policy returned unlocked coefficient key ${mutation.coefficientKey}`
        );
      }
      if (coefficient.value !== mutation.oldValue) {
        throw new Error(
          `Policy old value mismatch for ${mutation.coefficientKey}`
        );
      }

      await coefficientRepository.update(
        {
          tenantUserId,
          key: mutation.coefficientKey,
        },
        {
          value: mutation.newValue,
          eligibleSampleCount: mutation.newEligibleSampleCount,
          totalWeight: mutation.newTotalWeight,
          lastFeedbackId: feedback.id,
          version: () => '"version" + 1',
        }
      );

      await eventRepository.insert({
        tenantUserId,
        feedbackId: feedback.id,
        coefficientKey: mutation.coefficientKey,
        oldValue: mutation.oldValue,
        newValue: mutation.newValue,
        defaultValue: mutation.defaultValue,
        correctionFactor: mutation.correctionFactor,
        clampedCorrectionFactor: mutation.clampedCorrectionFactor,
        sampleCountBefore: mutation.oldEligibleSampleCount,
        sampleCountAfter: mutation.newEligibleSampleCount,
        weight: mutation.weight,
        reason: mutation.reason,
        algorithmVersion: policyResult.algorithmVersion,
        changeMetadata: mutation.metadata,
      });
      appliedMutations += 1;
    }

    if (appliedMutations === 0) {
      return this.markSkipped(
        manager,
        feedback,
        'no_coefficient_changes',
        policyResult.algorithmVersion
      );
    }

    feedback.processingStatus = FeedbackProcessingStatus.PROCESSED;
    feedback.processingError = null;
    feedback.algorithmVersion = policyResult.algorithmVersion;
    feedback.processedAt = new Date();
    return manager.getRepository(EstimateFeedback).save(feedback);
  }

  private async markSkipped(
    manager: EntityManager,
    feedback: EstimateFeedback,
    reason: string,
    algorithmVersion: string
  ): Promise<EstimateFeedback> {
    feedback.processingStatus = FeedbackProcessingStatus.SKIPPED;
    feedback.processingError = reason;
    feedback.algorithmVersion = algorithmVersion;
    feedback.processedAt = new Date();
    return manager.getRepository(EstimateFeedback).save(feedback);
  }

  private async markFeedbackFailed(
    feedbackId: string,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `Feedback calibration processing failed for ${feedbackId}: ${message}`
    );

    await this.dataSource.getRepository(EstimateFeedback).update(
      {
        id: feedbackId,
        processingStatus: In([
          FeedbackProcessingStatus.PENDING,
          FeedbackProcessingStatus.FAILED,
        ]),
      },
      {
        processingStatus: FeedbackProcessingStatus.FAILED,
        processingError: message.slice(0, 2000),
        algorithmVersion: 'no-learning-pr3.3',
        processedAt: new Date(),
      }
    );
  }
}
