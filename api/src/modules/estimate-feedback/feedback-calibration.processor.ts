import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { CoefficientChangeEvent } from '../calibration/entities/coefficient-change-event.entity';
import { Coefficient } from '../calibration/entities/coefficient.entity';
import { TenantCalibrationCoefficient } from '../calibration/entities/tenant-calibration-coefficient.entity';
import {
  Estimate,
  EstimateSource,
} from '../estimates/entities/estimate.entity';
import { Project } from '../projects/entities/project.entity';
import { Task } from '../tasks/entities/task.entity';
import {
  EstimateFeedback,
  FeedbackProcessingStatus,
} from './entities/estimate-feedback.entity';
import {
  FeedbackCoefficientMutation,
  FeedbackCalibrationPolicyResult,
  FEEDBACK_CALIBRATION_POLICY,
  FeedbackCalibrationPolicy,
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

const TENANT_COEFFICIENT_MIN_VALUE = 0.5;
const TENANT_COEFFICIENT_MAX_VALUE = 2;
const COEFFICIENT_KEY_PATTERN =
  /^(experience\.[A-Z]+|project\.complexity\.[A-Z]+|complexity\.[a-z0-9_]+)$/;

@Injectable()
export class FeedbackCalibrationProcessor {
  private readonly logger = new Logger(FeedbackCalibrationProcessor.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(FEEDBACK_CALIBRATION_POLICY)
    private readonly policy: FeedbackCalibrationPolicy
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
      try {
        await this.markFeedbackFailed(feedbackId, error);
      } catch (markFailedError) {
        const message =
          markFailedError instanceof Error
            ? markFailedError.message
            : String(markFailedError);
        this.logger.error(
          `Unable to persist failed status for feedback ${feedbackId}: ${message}`
        );
      }
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
        this.policy.algorithmVersion
      );
    }

    if (!task.experienceLevel || !project.complexity) {
      return this.markSkipped(
        manager,
        feedback,
        'missing_required_calibration_context',
        this.policy.algorithmVersion
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
        this.policy.algorithmVersion
      );
    }

    const unknownTargetKeys = await this.findUnknownCoefficientKeys(
      manager,
      targetCoefficientKeys
    );
    if (unknownTargetKeys.length > 0) {
      return this.markSkipped(
        manager,
        feedback,
        `unknown_coefficient_keys:${unknownTargetKeys.join(',')}`,
        this.policy.algorithmVersion
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

    return [...keys].sort();
  }

  private async findUnknownCoefficientKeys(
    manager: EntityManager,
    keys: string[]
  ): Promise<string[]> {
    const defaultValues = await this.loadDefaultValues(manager, keys);
    return keys.filter((key) => !defaultValues.has(key));
  }

  private async ensureAndLockTenantCoefficients(
    manager: EntityManager,
    tenantUserId: string,
    keys: string[]
  ): Promise<TenantCalibrationCoefficient[]> {
    const sortedKeys = [...new Set(keys)].sort();
    const defaultValues = await this.loadDefaultValues(manager, sortedKeys);

    for (const key of sortedKeys) {
      const defaultValue = defaultValues.get(key);
      if (!this.isValidCoefficientValue(defaultValue)) {
        throw new Error(`Missing valid global default for coefficient ${key}`);
      }
      if (
        defaultValue < TENANT_COEFFICIENT_MIN_VALUE ||
        defaultValue > TENANT_COEFFICIENT_MAX_VALUE
      ) {
        throw new Error(
          `Global default for coefficient ${key} is outside tenant bounds`
        );
      }
      await manager
        .createQueryBuilder()
        .insert()
        .into(TenantCalibrationCoefficient)
        .values({
          tenantUserId,
          key,
          value: defaultValue,
          defaultValue,
          minValue: TENANT_COEFFICIENT_MIN_VALUE,
          maxValue: TENANT_COEFFICIENT_MAX_VALUE,
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
        .filter((coefficient) =>
          this.isValidCoefficientValue(coefficient.value)
        )
        .map((coefficient) => [coefficient.key, coefficient.value])
    );
  }

  private async applyPolicyResult(
    manager: EntityManager,
    feedback: EstimateFeedback,
    tenantUserId: string,
    policyResult: FeedbackCalibrationPolicyResult,
    lockedCoefficients: TenantCalibrationCoefficient[]
  ): Promise<EstimateFeedback> {
    const lockedByKey = new Map(
      lockedCoefficients.map((coefficient) => [coefficient.key, coefficient])
    );
    this.validatePolicyResult(policyResult, lockedByKey, tenantUserId);
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

    for (const mutation of policyResult.mutations) {
      const coefficient = lockedByKey.get(mutation.coefficientKey);
      if (!coefficient)
        throw new Error(
          `Missing locked coefficient ${mutation.coefficientKey}`
        );
      const updated = await coefficientRepository.update(
        {
          tenantUserId,
          key: mutation.coefficientKey,
          version: coefficient.version,
        },
        {
          value: mutation.newValue,
          eligibleSampleCount: mutation.newEligibleSampleCount,
          totalWeight: mutation.newTotalWeight,
          ewmaLogError: mutation.newEwmaLogError,
          lastFeedbackId: feedback.id,
          version: () => '"version" + 1',
        }
      );

      if (updated.affected !== 1) {
        throw new Error(
          `Stale coefficient update for ${mutation.coefficientKey}`
        );
      }

      // A processed feedback row audits successful state application. Only real
      // value changes belong in coefficient_change_events.
      if (mutation.oldValue !== mutation.newValue)
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
    }

    feedback.processingStatus = FeedbackProcessingStatus.PROCESSED;
    feedback.processingError = null;
    feedback.algorithmVersion = policyResult.algorithmVersion;
    feedback.processedAt = new Date();
    return manager.getRepository(EstimateFeedback).save(feedback);
  }

  private validatePolicyResult(
    policyResult: FeedbackCalibrationPolicyResult,
    lockedByKey: Map<string, TenantCalibrationCoefficient>,
    tenantUserId: string
  ): void {
    if (
      policyResult.algorithmVersion !== this.policy.algorithmVersion ||
      !policyResult.algorithmVersion ||
      policyResult.algorithmVersion.length > 32
    ) {
      throw new Error(
        'Policy result algorithm version must match the active policy'
      );
    }

    if (
      new Set(policyResult.targetCoefficientKeys).size !==
      policyResult.targetCoefficientKeys.length
    ) {
      throw new Error('Policy returned duplicated target keys');
    }
    if (
      [...lockedByKey.values()].some((row) => row.tenantUserId !== tenantUserId)
    ) {
      throw new Error('Locked coefficient tenant mismatch');
    }
    const targetKeys = [...policyResult.targetCoefficientKeys].sort();
    const lockedKeys = [...lockedByKey.keys()].sort();
    if (JSON.stringify(targetKeys) !== JSON.stringify(lockedKeys)) {
      throw new Error(
        'Policy target keys do not match locked coefficient rows'
      );
    }

    if (policyResult.skipReason && policyResult.mutations.length > 0) {
      throw new Error('Skipped policy result cannot contain mutations');
    }
    if (policyResult.mutations.length === 0) return;

    const mutationKeys = policyResult.mutations.map(
      (mutation) => mutation.coefficientKey
    );
    if (new Set(mutationKeys).size !== mutationKeys.length) {
      throw new Error('Policy returned duplicated mutation keys');
    }

    for (const mutation of policyResult.mutations) {
      const coefficient = lockedByKey.get(mutation.coefficientKey);
      if (!coefficient) {
        throw new Error(
          `Policy returned unexpected mutation key ${mutation.coefficientKey}`
        );
      }
      this.validateMutation(mutation, coefficient);
    }
    if (mutationKeys.length !== targetKeys.length) {
      throw new Error('Policy must update state for every target coefficient');
    }
  }

  private validateMutation(
    mutation: FeedbackCoefficientMutation,
    coefficient: TenantCalibrationCoefficient
  ): void {
    if (
      coefficient.value !== mutation.oldValue ||
      coefficient.eligibleSampleCount !== mutation.oldEligibleSampleCount ||
      coefficient.totalWeight !== mutation.oldTotalWeight ||
      coefficient.ewmaLogError !== mutation.oldEwmaLogError
    ) {
      throw new Error(
        `Policy old state mismatch for ${mutation.coefficientKey}`
      );
    }
    if (
      !Number.isFinite(coefficient.minValue) ||
      !Number.isFinite(coefficient.maxValue) ||
      coefficient.minValue < TENANT_COEFFICIENT_MIN_VALUE ||
      coefficient.maxValue > TENANT_COEFFICIENT_MAX_VALUE ||
      coefficient.minValue > coefficient.maxValue ||
      !Number.isInteger(coefficient.version) ||
      coefficient.version < 1 ||
      !Number.isFinite(mutation.oldEwmaLogError) ||
      !Number.isFinite(mutation.newEwmaLogError)
    ) {
      throw new Error(
        `Invalid bounds or EWMA state for ${mutation.coefficientKey}`
      );
    }
    if (!COEFFICIENT_KEY_PATTERN.test(mutation.coefficientKey)) {
      throw new Error(`Invalid coefficient key ${mutation.coefficientKey}`);
    }

    if (
      !this.isValidCoefficientValue(mutation.oldValue) ||
      !this.isValidCoefficientValue(mutation.newValue) ||
      mutation.newValue < coefficient.minValue ||
      mutation.newValue > coefficient.maxValue
    ) {
      throw new Error(
        `Invalid coefficient value for ${mutation.coefficientKey}`
      );
    }

    if (mutation.defaultValue !== coefficient.defaultValue) {
      throw new Error(
        `Policy default value mismatch for ${mutation.coefficientKey}`
      );
    }
    if (
      mutation.defaultValue !== null &&
      (!this.isValidCoefficientValue(mutation.defaultValue) ||
        mutation.defaultValue < coefficient.minValue ||
        mutation.defaultValue > coefficient.maxValue)
    ) {
      throw new Error(`Invalid default value for ${mutation.coefficientKey}`);
    }

    if (
      !Number.isSafeInteger(mutation.oldEligibleSampleCount) ||
      !Number.isSafeInteger(mutation.newEligibleSampleCount) ||
      mutation.oldEligibleSampleCount < 0 ||
      mutation.newEligibleSampleCount < 0 ||
      mutation.newEligibleSampleCount > 2147483647 ||
      mutation.newEligibleSampleCount !== mutation.oldEligibleSampleCount + 1
    ) {
      throw new Error(`Invalid sample counts for ${mutation.coefficientKey}`);
    }

    if (
      !this.isValidNonNegativeFinite(mutation.oldTotalWeight) ||
      !this.isValidNonNegativeFinite(mutation.newTotalWeight) ||
      mutation.newTotalWeight <= mutation.oldTotalWeight ||
      mutation.weight === null ||
      mutation.weight <= 0 ||
      mutation.newTotalWeight !== mutation.oldTotalWeight + mutation.weight
    ) {
      throw new Error(`Invalid weights for ${mutation.coefficientKey}`);
    }

    for (const [label, value] of [
      ['correctionFactor', mutation.correctionFactor],
      ['clampedCorrectionFactor', mutation.clampedCorrectionFactor],
      ['weight', mutation.weight],
    ] as const) {
      if (
        value !== null &&
        (!Number.isFinite(value) ||
          (label === 'weight' ? value < 0 : value <= 0))
      ) {
        throw new Error(`Invalid ${label} for ${mutation.coefficientKey}`);
      }
    }
  }

  private isValidCoefficientValue(value: number | undefined | null): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  private isValidNonNegativeFinite(value: number): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
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
        algorithmVersion: this.policy.algorithmVersion,
        processedAt: new Date(),
      }
    );
  }
}
