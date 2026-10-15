import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  assertDisposableDockerIsolation,
  assertDisposablePostgresConfig,
  buildDisposableDatabaseName,
  createAdminDataSource,
  createFreshDatabase,
  readDisposablePostgresConfig,
  verifyNoApplicationTables,
  verifyTargetIdentity,
} from '../../database/testing/disposable-postgres-test-environment';
import { createMigrationValidationDataSourceOptions } from '../../database/migration-validation-data-source';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';
import { Task } from '../tasks/entities/task.entity';
import { ExperienceLevel } from '../tasks/entities/experience-level.enum';
import {
  Estimate,
  EstimateSource,
} from '../estimates/entities/estimate.entity';
import { Coefficient } from '../calibration/entities/coefficient.entity';
import { CoefficientChangeEvent } from '../calibration/entities/coefficient-change-event.entity';
import { TenantCalibrationCoefficient } from '../calibration/entities/tenant-calibration-coefficient.entity';
import { EstimateFeedbackModule } from './estimate-feedback.module';
import { FeedbackCalibrationProcessor } from './feedback-calibration.processor';
import { EstimateFeedbackService } from './estimate-feedback.service';
import {
  FEEDBACK_CALIBRATION_POLICY,
  FeedbackCalibrationPolicy,
} from './feedback-calibration-policy';
import {
  AdaptiveFeedbackCalibrationPolicy,
  ADAPTIVE_ALGORITHM_VERSION,
} from './adaptive-feedback-calibration-policy';
import {
  DeviationReason,
  EstimateFeedback,
  FeedbackProcessingStatus,
} from './entities/estimate-feedback.entity';

describe('Adaptive calibration production binding (disposable PostgreSQL)', () => {
  let module: TestingModule;
  let db: DataSource;
  let processor: FeedbackCalibrationProcessor;
  let policy: AdaptiveFeedbackCalibrationPolicy;
  let owner: User;
  let task: Task;
  let estimate: Estimate;
  let defaults: Coefficient[];

  const rows = (tenantUserId = owner.id) =>
    db
      .getRepository(TenantCalibrationCoefficient)
      .find({ where: { tenantUserId }, order: { key: 'ASC' } });
  const feedback = (id: string) =>
    db.getRepository(EstimateFeedback).findOneByOrFail({ id });
  const events = (feedbackId: string) =>
    db
      .getRepository(CoefficientChangeEvent)
      .find({ where: { feedbackId }, order: { coefficientKey: 'ASC' } });
  const pending = (
    actualHours = 15,
    overrides: Partial<EstimateFeedback> = {}
  ) =>
    db.getRepository(EstimateFeedback).save({
      taskId: task.id,
      estimateId: estimate.id,
      estimatedHoursSnapshot: 10,
      actualHours,
      ...overrides,
    });
  const fixture = async () => {
    const user = await db
      .getRepository(User)
      .save({ email: `${randomUUID()}@test.invalid`, password: 'unused' });
    const project = await db
      .getRepository(Project)
      .save({ name: 'Calibration test', userId: user.id });
    const task = await db.getRepository(Task).save({
      title: 'Test',
      project,
      experienceLevel: ExperienceLevel.MIDDLE,
      complexityTags: ['legacy_code', 'refactor'],
    });
    const estimate = await db
      .getRepository(Estimate)
      .save({ task, source: EstimateSource.FINAL, finalEstimate: 10 });
    return { user, task, estimate };
  };

  beforeAll(async () => {
    const config = readDisposablePostgresConfig(
      buildDisposableDatabaseName('ai_estimator_integration_test_adaptive')
    );
    assertDisposablePostgresConfig(config);
    assertDisposableDockerIsolation(config);
    const admin = createAdminDataSource(config);
    await admin.initialize();
    try {
      await createFreshDatabase(admin, config);
    } finally {
      await admin.destroy();
    }
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(
          createMigrationValidationDataSourceOptions({
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            database: config.targetDatabase,
          })
        ),
        EstimateFeedbackModule,
      ],
    }).compile();
    db = module.get(DataSource);
    await verifyTargetIdentity(db, config);
    await verifyNoApplicationTables(db);
    await db.runMigrations({ transaction: 'all' });
    await module.init();
    processor = module.get(FeedbackCalibrationProcessor);
    policy = module.get(AdaptiveFeedbackCalibrationPolicy);
    expect(
      module.get<FeedbackCalibrationPolicy>(FEEDBACK_CALIBRATION_POLICY)
    ).toBe(policy);
    defaults = await db
      .getRepository(Coefficient)
      .find({ order: { key: 'ASC' } });
    expect(defaults).toHaveLength(13);
    expect(defaults.every((row) => row.value >= 0.5 && row.value <= 2)).toBe(
      true
    );
  });
  beforeEach(async () => {
    const f = await fixture();
    owner = f.user;
    task = f.task;
    estimate = f.estimate;
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    expect(
      await db.getRepository(Coefficient).find({ order: { key: 'ASC' } })
    ).toEqual(defaults);
  });
  afterAll(async () => {
    if (module) await module.close();
  });

  it('persists warm-up counts, normalized weights, exact EWMA and versions without value events', async () => {
    for (let n = 1; n <= 4; n++) {
      const f = await pending();
      const result = await processor.processFeedback(f.id);
      expect(result.processingStatus).toBe(FeedbackProcessingStatus.PROCESSED);
      expect(result.algorithmVersion).toBe(ADAPTIVE_ALGORITHM_VERSION);
      expect(result.processingError).toBeNull();
      expect(result.processedAt).toBeInstanceOf(Date);
      expect(await events(f.id)).toHaveLength(0);
      const state = await rows();
      expect(state).toHaveLength(4);
      for (const row of state) {
        expect(row.value).toBe(row.defaultValue);
        expect(row.eligibleSampleCount).toBe(n);
        expect(row.totalWeight).toBe(n / 4);
        expect(row.ewmaLogError).toBeCloseTo(
          (Math.log(1.5) / 4) * (1 - 0.8 ** n),
          14
        );
        expect(row.lastFeedbackId).toBe(f.id);
        expect(row.version).toBe(n + 1);
      }
    }
  });
  it('moves coefficients on sample five and records truthful value events', async () => {
    for (let n = 0; n < 4; n++)
      await processor.processFeedback((await pending()).id);
    const before = await rows();
    const f = await pending();
    await processor.processFeedback(f.id);
    const state = await rows();
    const audit = await events(f.id);
    expect(audit).toHaveLength(4);
    for (const [i, row] of state.entries()) {
      expect(row.value).toBeCloseTo(
        before[i].value * Math.exp(((0.08 / 26) * Math.log(1.5)) / 4),
        14
      );
      expect(row.eligibleSampleCount).toBe(5);
      expect(row.totalWeight).toBe(1.25);
      expect(row.ewmaLogError).toBeCloseTo(
        0.8 * before[i].ewmaLogError + (0.2 * Math.log(1.5)) / 4,
        14
      );
      expect(audit[i]).toMatchObject({
        oldValue: before[i].value,
        newValue: row.value,
        tenantUserId: owner.id,
        sampleCountBefore: 4,
        sampleCountAfter: 5,
        weight: 0.25,
        algorithmVersion: ADAPTIVE_ALGORITHM_VERSION,
      });
      expect(audit[i].changeMetadata).toMatchObject({
        newEwmaLogError: row.ewmaLogError,
      });
    }
  });
  it('applies identical feedback exactly once under concurrent requests including state-only observations', async () => {
    const f = await pending();
    await Promise.all(
      Array.from({ length: 8 }, () => processor.processFeedback(f.id))
    );
    expect(
      (await rows()).every(
        (row) =>
          row.eligibleSampleCount === 1 &&
          row.totalWeight === 0.25 &&
          row.version === 2
      )
    ).toBe(true);
    expect(await events(f.id)).toHaveLength(0);
    for (let n = 0; n < 3; n++)
      await processor.processFeedback((await pending()).id);
    const moving = await pending();
    await Promise.all(
      Array.from({ length: 8 }, () => processor.processFeedback(moving.id))
    );
    expect(
      (await rows()).every(
        (row) => row.eligibleSampleCount === 5 && row.version === 6
      )
    ).toBe(true);
    expect(await events(moving.id)).toHaveLength(4);
  });
  it('serializes different concurrent observations using the latest locked EWMA without lost increments', async () => {
    const all = await Promise.all(Array.from({ length: 20 }, () => pending()));
    await Promise.all(all.map((f) => processor.processFeedback(f.id)));
    for (const row of await rows()) {
      expect(row.eligibleSampleCount).toBe(20);
      expect(row.totalWeight).toBe(5);
      expect(row.version).toBe(21);
      expect(row.ewmaLogError).toBeCloseTo(
        (Math.log(1.5) / 4) * (1 - 0.8 ** 20),
        14
      );
      expect(row.value).toBeGreaterThan(row.defaultValue);
    }
    for (const f of all)
      expect((await feedback(f.id)).processingStatus).toBe(
        FeedbackProcessingStatus.PROCESSED
      );
  });
  it('keeps tenants independent with opposite observations and preserves global defaults', async () => {
    const b = await fixture();
    for (let n = 0; n < 35; n++)
      await Promise.all([
        processor.processFeedback((await pending()).id),
        processor.processFeedback(
          (
            await pending(6, { taskId: b.task.id, estimateId: b.estimate.id })
          ).id
        ),
      ]);
    const aRows = await rows();
    const bRows = await rows(b.user.id);
    expect(
      aRows.every(
        (r) =>
          r.value > r.defaultValue &&
          r.ewmaLogError > 0 &&
          r.eligibleSampleCount === 35
      )
    ).toBe(true);
    expect(
      bRows.every(
        (r) =>
          r.value < r.defaultValue &&
          r.ewmaLogError < 0 &&
          r.eligibleSampleCount === 35
      )
    ).toBe(true);
  });
  it('records accurate feedback and decays EWMA with no value event even after learning', async () => {
    for (let n = 0; n < 6; n++)
      await processor.processFeedback((await pending()).id);
    const before = await rows();
    const f = await pending(10, {
      reasonForDeviation: DeviationReason.ESTIMATE_WAS_ACCURATE,
    });
    await processor.processFeedback(f.id);
    const after = await rows();
    for (let i = 0; i < after.length; i++) {
      expect(after[i].value).toBe(before[i].value);
      expect(after[i].ewmaLogError).toBeCloseTo(
        0.8 * before[i].ewmaLogError,
        14
      );
      expect(after[i].eligibleSampleCount).toBe(7);
      expect(after[i].lastFeedbackId).toBe(f.id);
    }
    expect(await events(f.id)).toHaveLength(0);
    expect((await feedback(f.id)).processingStatus).toBe(
      FeedbackProcessingStatus.PROCESSED
    );
  });
  it.each([
    DeviationReason.SCOPE_CREEP,
    DeviationReason.EXTERNAL_DEPENDENCY_DELAY,
    DeviationReason.ENVIRONMENT_OR_TOOLING_ISSUES,
  ])('skips %s and preserves feedback', async (reason) => {
    const f = await pending(50, { reasonForDeviation: reason });
    await processor.processFeedback(f.id);
    expect(await feedback(f.id)).toMatchObject({
      actualHours: 50,
      processingStatus: FeedbackProcessingStatus.SKIPPED,
      processingError: `excluded_deviation_reason:${reason}`,
    });
    expect((await rows()).every((row) => row.eligibleSampleCount === 0)).toBe(
      true
    );
    expect(await events(f.id)).toHaveLength(0);
  });
  it.each([0, -1, NaN, Infinity])(
    'skips invalid actual hours %s without applying state',
    async (actual) => {
      const f = await pending(actual);
      await processor.processFeedback(f.id);
      expect(await feedback(f.id)).toMatchObject({
        processingStatus: FeedbackProcessingStatus.SKIPPED,
        processingError: 'invalid_actual_hours',
      });
      expect((await rows()).every((row) => row.eligibleSampleCount === 0)).toBe(
        true
      );
    }
  );
  it('skips incomplete factor context and malformed keys instead of silently attributing to remaining factors', async () => {
    await db.query('UPDATE tasks SET "experienceLevel" = NULL WHERE id = $1', [
      task.id,
    ]);
    const incomplete = await pending();
    await processor.processFeedback(incomplete.id);
    expect((await feedback(incomplete.id)).processingError).toBe(
      'missing_required_calibration_context'
    );
    expect(await rows()).toHaveLength(0);
    await db.query(
      'UPDATE tasks SET "experienceLevel" = $1, "complexityTags" = $2 WHERE id = $3',
      ['MIDDLE', JSON.stringify(['INVALID']), task.id]
    );
    const malformed = await pending();
    await processor.processFeedback(malformed.id);
    expect((await feedback(malformed.id)).processingError).toBe(
      'unknown_coefficient_keys:complexity.INVALID'
    );
    expect(await rows()).toHaveLength(0);
  });
  it('preserves historical disabled feedback as terminal and never replays it', async () => {
    const f = await pending(15, {
      processingStatus: FeedbackProcessingStatus.SKIPPED,
      algorithmVersion: 'no-learning-pr3.3',
      processingError: 'learning_policy_disabled_until_pr3_4',
      processedAt: new Date('2026-10-14T00:00:00Z'),
    });
    const before = await feedback(f.id);
    await processor.processFeedback(f.id);
    await processor.processFeedback(f.id);
    expect(await feedback(f.id)).toEqual(before);
    expect(await rows()).toHaveLength(0);
  });
  it('rolls back lazy initialization on failure and applies retry once', async () => {
    const f = await pending();
    await expect(
      processor.processFeedback(f.id, { failAfterCoefficientLocks: true })
    ).rejects.toThrow('Injected');
    expect(await rows()).toHaveLength(0);
    expect((await feedback(f.id)).processingStatus).toBe(
      FeedbackProcessingStatus.FAILED
    );
    await processor.processFeedback(f.id);
    await processor.processFeedback(f.id);
    expect(
      (await rows()).every(
        (row) => row.eligibleSampleCount === 1 && row.version === 2
      )
    ).toBe(true);
  });
  it('rolls back all coefficient and event writes if a later database audit insert fails', async () => {
    for (let n = 0; n < 4; n++)
      await processor.processFeedback((await pending()).id);
    const before = await rows();
    const f = await pending();
    await db.query(`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW."coefficientKey" = 'experience.MIDDLE' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`);
    await db.query(
      `CREATE TRIGGER reject_test_audit BEFORE INSERT ON coefficient_change_events FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`
    );
    try {
      await expect(processor.processFeedback(f.id)).rejects.toThrow(
        'test audit failure'
      );
    } finally {
      await db.query(
        'DROP TRIGGER reject_test_audit ON coefficient_change_events'
      );
      await db.query('DROP FUNCTION reject_test_audit()');
    }
    expect(await rows()).toEqual(before);
    expect(await events(f.id)).toHaveLength(0);
    expect((await feedback(f.id)).processingStatus).toBe(
      FeedbackProcessingStatus.FAILED
    );
    await processor.processFeedback(f.id);
    expect((await rows()).every((row) => row.eligibleSampleCount === 5)).toBe(
      true
    );
    expect(await events(f.id)).toHaveLength(4);
  });
  it.each([
    'stale-count',
    'stale-ewma',
    'invalid-ewma',
    'version',
    'duplicate',
    'duplicate-target',
    'unknown',
    'negative-weight',
    'missing-mutation',
    'default-mismatch',
  ])(
    'rejects %s before any write, including zero movement mutations',
    async (defect) => {
      const f = await pending();
      const evaluate = policy.evaluate.bind(policy);
      jest.spyOn(policy, 'evaluate').mockImplementationOnce(async (c) => {
        const result = await evaluate(c);
        const m = result.mutations[1];
        if (defect === 'stale-count') m.oldEligibleSampleCount++;
        if (defect === 'stale-ewma') m.oldEwmaLogError = 1;
        if (defect === 'invalid-ewma') m.newEwmaLogError = NaN;
        if (defect === 'version') result.algorithmVersion = 'incorrect';
        if (defect === 'duplicate') result.mutations.push(result.mutations[0]);
        if (defect === 'duplicate-target')
          result.targetCoefficientKeys.push(result.targetCoefficientKeys[0]);
        if (defect === 'unknown') m.coefficientKey = 'complexity.unknown';
        if (defect === 'negative-weight') m.newTotalWeight = -1;
        if (defect === 'missing-mutation') result.mutations.pop();
        if (defect === 'default-mismatch') m.defaultValue = 1.5;
        return result;
      });
      await expect(processor.processFeedback(f.id)).rejects.toThrow();
      expect(await rows()).toHaveLength(0);
      expect(await events(f.id)).toHaveLength(0);
      expect((await feedback(f.id)).processingStatus).toBe(
        FeedbackProcessingStatus.FAILED
      );
    }
  );
  it('honors database bounds with saturated values and still records samples', async () => {
    await processor.processFeedback((await pending()).id);
    await db
      .getRepository(TenantCalibrationCoefficient)
      .update(
        { tenantUserId: owner.id },
        { value: 2, eligibleSampleCount: 30 }
      );
    const f = await pending(1000);
    await processor.processFeedback(f.id);
    expect(
      (await rows()).every(
        (row) =>
          row.value === 2 &&
          row.eligibleSampleCount === 31 &&
          Number.isFinite(row.ewmaLogError)
      )
    ).toBe(true);
    expect(await events(f.id)).toHaveLength(0);
    await db
      .getRepository(TenantCalibrationCoefficient)
      .update({ tenantUserId: owner.id }, { value: 0.5 });
    const low = await pending(0.01);
    await processor.processFeedback(low.id);
    expect(
      (await rows()).every(
        (row) => row.value === 0.5 && row.eligibleSampleCount === 32
      )
    ).toBe(true);
    expect(await events(low.id)).toHaveLength(0);
  });
  it('processes new feedback through the service production policy and keeps idempotent payloads exactly once', async () => {
    const service = module.get(EstimateFeedbackService);
    const dto = {
      taskId: task.id,
      estimateId: estimate.id,
      actualHours: 15,
      idempotencyKey: 'adaptive-service',
    };
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => service.create(dto, owner.id))
    );
    expect(new Set(responses.map((f) => f.id)).size).toBe(1);
    expect((await feedback(responses[0].id)).processingStatus).toBe(
      FeedbackProcessingStatus.PROCESSED
    );
    expect((await rows()).every((row) => row.eligibleSampleCount === 1)).toBe(
      true
    );
    await expect(
      service.create({ ...dto, actualHours: 16 }, owner.id)
    ).rejects.toThrow('different feedback payload');
  });
});
