import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../app.module';
import { AiEstimatorService } from '../ai-estimator/ai-estimator.service';
import { CalibrationService } from '../calibration/calibration.service';
import { EstimateSource } from '../estimates/entities/estimate.entity';
import {
  applyRuntimePostgresEnv,
  assertDisposableDockerIsolation,
  assertDisposablePostgresConfig,
  buildDisposableDatabaseName,
  createAdminDataSource,
  createFreshDatabase,
  createTargetDataSource,
  DisposablePostgresConfig,
  initializeWithRetry,
  readDisposablePostgresConfig,
  verifyNoApplicationTables,
  verifyTargetIdentity,
} from '../../database/testing/disposable-postgres-test-environment';

type TestUser = {
  email: string;
  password: string;
  id: string;
  accessToken: string;
  refreshCookie: string;
};

type UserResources = {
  projectId: string;
  taskId: string;
  estimateId: string;
  finalEstimateId: string;
  feedbackId: string;
};

const createAiEstimatorMock = () => ({
  createInitialAnalysis: jest.fn().mockResolvedValue({
    type: 'estimate',
    data: {
      subtasks: [
        {
          title: 'Implementation',
          description: 'Build and verify the requested behavior.',
          estimateHours: 4,
          explanation: 'Deterministic integration-test estimate.',
        },
      ],
      risks: [],
      managerNote: 'Deterministic manager note.',
      questions: null,
    },
  }),
  getAiAnalysis: jest.fn().mockResolvedValue({
    type: 'estimate',
    data: {
      subtasks: [
        {
          title: 'Clarified implementation',
          description: 'Build clarified behavior.',
          estimateHours: 3,
          explanation: 'Deterministic clarified estimate.',
        },
      ],
      risks: [],
      managerNote: 'Deterministic clarified manager note.',
      questions: null,
    },
  }),
  computeCalibratedEstimate: jest.fn().mockResolvedValue({
    p10: 3,
    p50: 4,
    p90: 5,
    confidence: 70,
    explanation: 'Deterministic calibrated estimate.',
    logs: ['deterministic integration-test log'],
    topDown: 4,
    bottomUp: 4,
    divergencePct: 0,
  }),
});

const authHeader = (user: TestUser) => ({
  Authorization: `Bearer ${user.accessToken}`,
});

const firstCookie = (headers: string | string[] | undefined): string => {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  if (!values.length) {
    throw new Error('Expected Set-Cookie header');
  }
  return values[0].split(';')[0];
};

const countRows = async (
  dataSource: DataSource,
  tableName: string
): Promise<number> => {
  const [row] = await dataSource.query(
    `SELECT count(*)::int AS count FROM "${tableName}"`
  );
  return Number(row.count);
};

const coefficientSnapshot = async (
  dataSource: DataSource
): Promise<Record<string, number>> => {
  const rows = await dataSource.query(
    `SELECT "key", "value" FROM "coefficients" ORDER BY "key"`
  );
  return Object.fromEntries(
    rows.map((row: { key: string; value: number }) => [
      row.key,
      Number(row.value),
    ])
  );
};

const createFreshConfig = (databaseName: string): DisposablePostgresConfig =>
  readDisposablePostgresConfig(databaseName);

const clearRuntimePostgresEnv = (): void => {
  delete process.env.POSTGRES_HOST;
  delete process.env.POSTGRES_PORT;
  delete process.env.POSTGRES_USER;
  delete process.env.POSTGRES_PASSWORD;
  delete process.env.POSTGRES_DB;
};

const prepareDatabase = async (
  config: DisposablePostgresConfig,
  runMigrations: boolean
): Promise<void> => {
  assertDisposablePostgresConfig(config);
  assertDisposableDockerIsolation(config);

  const adminDataSource = createAdminDataSource(config);
  await initializeWithRetry(adminDataSource);

  try {
    await createFreshDatabase(adminDataSource, config);
  } finally {
    await adminDataSource.destroy();
  }

  const targetDataSource = createTargetDataSource(config);
  await initializeWithRetry(targetDataSource);

  try {
    await verifyTargetIdentity(targetDataSource, config);
    await verifyNoApplicationTables(targetDataSource);

    if (runMigrations) {
      const migrations = await targetDataSource.runMigrations({
        transaction: 'all',
      });
      expect(migrations.map((migration) => migration.name)).toEqual([
        'BaselineCurrentSchema20261014000000',
        'SeedBaselineCoefficients20261014000001',
        'AddTenantCalibrationFoundation20261014000002',
      ]);
    }
  } finally {
    await targetDataSource.destroy();
  }
};

const addLegacyMigrationHistoryRow = async (
  config: DisposablePostgresConfig
): Promise<void> => {
  const targetDataSource = createTargetDataSource(config);
  await initializeWithRetry(targetDataSource);

  try {
    await targetDataSource.query(
      `INSERT INTO "migrations" ("timestamp", "name") VALUES ($1, $2)`,
      [1723634255000, 'SeedCoefficients1723634255000']
    );
  } finally {
    await targetDataSource.destroy();
  }
};

const createTestingApp = async (): Promise<INestApplication> => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(AiEstimatorService)
    .useValue(createAiEstimatorMock())
    .compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe());
  await app.init();
  return app;
};

describe('Runtime database safety and tenant isolation (PostgreSQL integration)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userA: TestUser;
  let userB: TestUser;
  let resourcesA: UserResources;
  let resourcesB: UserResources;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'integration-access-secret-32-characters';
    process.env.JWT_REFRESH_SECRET = 'integration-refresh-secret-32-characters';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
    process.env.OPENAI_API_KEY = 'not-used-in-integration-tests';

    const emptyConfig = createFreshConfig(
      buildDisposableDatabaseName('ai_estimator_integration_test_empty')
    );
    await prepareDatabase(emptyConfig, false);
    applyRuntimePostgresEnv(emptyConfig);

    await expect(createTestingApp()).rejects.toThrow(
      /Database schema is not migrated/
    );
    clearRuntimePostgresEnv();

    const legacyHistoryConfig = createFreshConfig(
      buildDisposableDatabaseName('ai_estimator_integration_test_legacy')
    );
    await prepareDatabase(legacyHistoryConfig, true);
    await addLegacyMigrationHistoryRow(legacyHistoryConfig);
    applyRuntimePostgresEnv(legacyHistoryConfig);

    await expect(createTestingApp()).rejects.toThrow(/legacy-managed/);
    clearRuntimePostgresEnv();

    const migratedConfig = createFreshConfig(
      buildDisposableDatabaseName('ai_estimator_integration_test_migrated')
    );
    await prepareDatabase(migratedConfig, true);
    applyRuntimePostgresEnv(migratedConfig);

    app = await createTestingApp();
    dataSource = app.get(DataSource);
    await verifyTargetIdentity(dataSource, migratedConfig);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  const registerUser = async (
    email: string,
    password: string
  ): Promise<TestUser> => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);

    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user).toEqual(
      expect.objectContaining({ id: expect.any(String), email })
    );
    expect(response.body.user.password).toBeUndefined();
    expect(response.body.user.refreshToken).toBeUndefined();

    return {
      email,
      password,
      id: response.body.user.id,
      accessToken: response.body.accessToken,
      refreshCookie: firstCookie(response.headers['set-cookie']),
    };
  };

  const createResources = async (
    owner: TestUser,
    label: string
  ): Promise<UserResources> => {
    const projectResponse = await request(app.getHttpServer())
      .post('/api/projects')
      .set(authHeader(owner))
      .send({
        name: `${label} Project`,
        description: `${label} project description`,
        complexity: 'MEDIUM',
        overhead: 10,
      })
      .expect(201);

    const taskResponse = await request(app.getHttpServer())
      .post('/api/tasks')
      .set(authHeader(owner))
      .send({
        projectId: projectResponse.body.id,
        title: `${label} Task`,
        description:
          'Build a deterministic integration-test task with enough detail.',
        technology: 'Node.js',
        experienceLevel: 'MIDDLE',
        tags: ['backend'],
        acceptanceCriteria: ['HTTP path works'],
        breakdown: false,
        useAiEstimate: true,
      })
      .expect(201);

    expect(taskResponse.body.estimates.length).toBeGreaterThan(0);
    const finalEstimate = taskResponse.body.estimates.find(
      (estimate: { source: EstimateSource }) =>
        estimate.source === EstimateSource.FINAL
    );
    expect(finalEstimate).toEqual(
      expect.objectContaining({ id: expect.any(String), finalEstimate: 4 })
    );

    const estimateResponse = await request(app.getHttpServer())
      .post('/api/estimates')
      .set(authHeader(owner))
      .send({
        taskId: taskResponse.body.id,
        finalEstimate: 8,
        source: EstimateSource.MANUAL,
        explanation: `${label} explicit estimate`,
      })
      .expect(201);

    const feedbackResponse = await request(app.getHttpServer())
      .post('/api/estimate-feedback')
      .set(authHeader(owner))
      .send({
        taskId: taskResponse.body.id,
        actualHours: 8,
        rating: 5,
        reasonForDeviation: 'ESTIMATE_WAS_ACCURATE',
        comment: `${label} feedback`,
      })
      .expect(201);

    return {
      projectId: projectResponse.body.id,
      taskId: taskResponse.body.id,
      estimateId: estimateResponse.body.id,
      finalEstimateId: finalEstimate.id,
      feedbackId: feedbackResponse.body.id,
    };
  };

  it('creates tenant calibration foundation schema with expected constraints and indexes', async () => {
    const tableRows = await dataSource.query(`
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('tenant_calibration_coefficients', 'coefficient_change_events')
      ORDER BY table_name
    `);
    expect(tableRows.map((row: { name: string }) => row.name)).toEqual([
      'coefficient_change_events',
      'tenant_calibration_coefficients',
    ]);

    const constraintRows = await dataSource.query(
      `
        SELECT conname AS name
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND conname = ANY($1)
        ORDER BY conname
      `,
      [
        [
          'FK_tenant_calibration_coefficients_tenant_user',
          'FK_coefficient_change_events_tenant_user',
          'FK_coefficient_change_events_feedback',
          'FK_estimate_feedbacks_estimate',
          'CHK_tenant_calibration_coefficients_value_bounds',
          'CHK_tenant_calibration_coefficients_default_bounds',
          'CHK_tenant_calibration_coefficients_sample_count',
          'CHK_tenant_calibration_coefficients_total_weight',
          'CHK_tenant_calibration_coefficients_version',
        ],
      ]
    );
    expect(constraintRows.map((row: { name: string }) => row.name)).toEqual([
      'CHK_tenant_calibration_coefficients_default_bounds',
      'CHK_tenant_calibration_coefficients_sample_count',
      'CHK_tenant_calibration_coefficients_total_weight',
      'CHK_tenant_calibration_coefficients_value_bounds',
      'CHK_tenant_calibration_coefficients_version',
      'FK_coefficient_change_events_feedback',
      'FK_coefficient_change_events_tenant_user',
      'FK_estimate_feedbacks_estimate',
      'FK_tenant_calibration_coefficients_tenant_user',
    ]);

    const indexRows = await dataSource.query(
      `
        SELECT indexname AS name, indexdef AS definition
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1)
        ORDER BY indexname
      `,
      [
        [
          'UQ_tenant_calibration_coefficients_tenant_key',
          'UQ_coefficient_change_events_feedback_key',
          'IDX_estimate_feedbacks_task_idempotency_key',
          'IDX_estimate_feedbacks_estimate_id',
          'IDX_estimate_feedbacks_processing_status',
        ],
      ]
    );
    expect(indexRows.map((row: { name: string }) => row.name)).toEqual([
      'IDX_estimate_feedbacks_estimate_id',
      'IDX_estimate_feedbacks_processing_status',
      'IDX_estimate_feedbacks_task_idempotency_key',
      'UQ_coefficient_change_events_feedback_key',
      'UQ_tenant_calibration_coefficients_tenant_key',
    ]);
    expect(
      indexRows.find(
        (row: { name: string }) =>
          row.name === 'IDX_estimate_feedbacks_task_idempotency_key'
      )?.definition
    ).toContain('WHERE ("idempotencyKey" IS NOT NULL)');

    const feedbackColumnRows = await dataSource.query(
      `
        SELECT column_name AS name, is_nullable AS nullable, column_default AS default
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'estimate_feedbacks'
          AND column_name = ANY($1)
        ORDER BY column_name
      `,
      [
        [
          'estimateId',
          'idempotencyKey',
          'estimatedHoursSnapshot',
          'processingStatus',
          'processedAt',
          'processingError',
          'algorithmVersion',
        ],
      ]
    );
    expect(feedbackColumnRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'processingStatus',
          nullable: 'NO',
          default: "'pending'::estimate_feedbacks_processingstatus_enum",
        }),
        expect.objectContaining({ name: 'estimateId', nullable: 'YES' }),
        expect.objectContaining({ name: 'idempotencyKey', nullable: 'YES' }),
        expect.objectContaining({
          name: 'estimatedHoursSnapshot',
          nullable: 'YES',
        }),
      ])
    );
  });

  it('registers, logs in, refreshes, logs out, and protects endpoints', async () => {
    userA = await registerUser('phase3-a@example.com', 'password123');
    userB = await registerUser('phase3-b@example.com', 'password123');

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: userA.email, password: userA.password })
      .expect(200);
    expect(loginResponse.body.user.password).toBeUndefined();
    expect(loginResponse.body.user.refreshToken).toBeUndefined();

    userA.accessToken = loginResponse.body.accessToken;
    userA.refreshCookie = firstCookie(loginResponse.headers['set-cookie']);

    const usersResponse = await request(app.getHttpServer())
      .get('/api/users')
      .set(authHeader(userA))
      .expect(200);
    expect(usersResponse.body).toEqual([
      expect.objectContaining({ id: userA.id, email: userA.email }),
    ]);
    expect(usersResponse.body[0].password).toBeUndefined();
    expect(usersResponse.body[0].refreshToken).toBeUndefined();

    const userResponse = await request(app.getHttpServer())
      .get(`/api/users/${userA.id}`)
      .set(authHeader(userA))
      .expect(200);
    expect(userResponse.body.password).toBeUndefined();
    expect(userResponse.body.refreshToken).toBeUndefined();

    const userUpdateResponse = await request(app.getHttpServer())
      .patch(`/api/users/${userA.id}`)
      .set(authHeader(userA))
      .send({ email: userA.email, password: 'must-not-change' })
      .expect(200);
    expect(userUpdateResponse.body.password).toBeUndefined();
    expect(userUpdateResponse.body.refreshToken).toBeUndefined();

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', [userA.refreshCookie])
      .expect(200)
      .expect((response) => {
        expect(response.body.accessToken).toEqual(expect.any(String));
        expect(response.body.refreshToken).toEqual(expect.any(String));
      });

    const projectCountBefore = await countRows(dataSource, 'projects');
    await request(app.getHttpServer())
      .post('/api/projects')
      .send({
        name: 'Unauthorized Project',
        description: 'This must not be inserted',
      })
      .expect(401);
    expect(await countRows(dataSource, 'projects')).toBe(projectCountBefore);

    await request(app.getHttpServer()).get('/api/projects').expect(401);

    const logoutResponse = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set(authHeader(userA))
      .expect(200);
    expect(logoutResponse.body).toEqual({ success: true });
    expect(logoutResponse.body.password).toBeUndefined();
    expect(logoutResponse.body.refreshToken).toBeUndefined();
    expect(JSON.stringify(logoutResponse.body)).not.toContain('password');
    expect(JSON.stringify(logoutResponse.body)).not.toContain('refreshToken');

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', [userA.refreshCookie])
      .expect(403);
  });

  it('creates isolated projects, tasks, estimates, and feedback for users A and B', async () => {
    const reloginA = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: userA.email, password: userA.password })
      .expect(200);
    userA.accessToken = reloginA.body.accessToken;
    userA.refreshCookie = firstCookie(reloginA.headers['set-cookie']);

    resourcesA = await createResources(userA, 'User A');
    resourcesB = await createResources(userB, 'User B');

    const projectsA = await request(app.getHttpServer())
      .get('/api/projects')
      .set(authHeader(userA))
      .expect(200);
    expect(projectsA.body.map((project: { id: string }) => project.id)).toEqual(
      [resourcesA.projectId]
    );

    const projectsB = await request(app.getHttpServer())
      .get('/api/projects')
      .set(authHeader(userB))
      .expect(200);
    expect(projectsB.body.map((project: { id: string }) => project.id)).toEqual(
      [resourcesB.projectId]
    );
  });

  it('resolves tenant coefficient overrides without cross-tenant leakage or global mutation', async () => {
    const coefficientsBefore = await coefficientSnapshot(dataSource);
    await dataSource.query(
      `
        INSERT INTO "tenant_calibration_coefficients"
          ("tenantUserId", "key", "value", "defaultValue", "minValue", "maxValue")
        VALUES
          ($1, 'experience.MIDDLE', 1.25, 1, 0.5, 2),
          ($2, 'experience.MIDDLE', 0.85, 1, 0.5, 2)
      `,
      [userA.id, userB.id]
    );

    const calibrationService = app.get(CalibrationService);
    const keys = ['experience.MIDDLE', 'project.complexity.MEDIUM'];
    const userACoefficients = await calibrationService.getEffectiveCoefficients(
      keys,
      userA.id
    );
    const userBCoefficients = await calibrationService.getEffectiveCoefficients(
      keys,
      userB.id
    );
    const globalCoefficients =
      await calibrationService.getEffectiveCoefficients(keys, undefined);

    expect(userACoefficients.get('experience.MIDDLE')).toBe(1.25);
    expect(userBCoefficients.get('experience.MIDDLE')).toBe(0.85);
    expect(globalCoefficients.get('experience.MIDDLE')).toBe(1);
    expect(userACoefficients.get('project.complexity.MEDIUM')).toBe(1);
    expect(await coefficientSnapshot(dataSource)).toEqual(coefficientsBefore);
  });

  it('stores feedback estimate snapshots and supports idempotent submissions', async () => {
    const coefficientsBefore = await coefficientSnapshot(dataSource);
    const payload = {
      taskId: resourcesA.taskId,
      estimateId: resourcesA.finalEstimateId,
      idempotencyKey: 'user-a-feedback-final-v1',
      actualHours: 6,
      rating: 3,
      reasonForDeviation: 'INCORRECT_INITIAL_ASSUMPTIONS',
      missedComplexityTags: ['legacy_code'],
      comment: 'Snapshot this final estimate',
    };

    const firstResponse = await request(app.getHttpServer())
      .post('/api/estimate-feedback')
      .set(authHeader(userA))
      .send(payload)
      .expect(201);

    expect(firstResponse.body).toEqual(
      expect.objectContaining({
        taskId: resourcesA.taskId,
        estimateId: resourcesA.finalEstimateId,
        idempotencyKey: payload.idempotencyKey,
        estimatedHoursSnapshot: 4,
        actualHours: 6,
      })
    );

    const secondResponse = await request(app.getHttpServer())
      .post('/api/estimate-feedback')
      .set(authHeader(userA))
      .send(payload)
      .expect(201);
    expect(secondResponse.body.id).toBe(firstResponse.body.id);
    expect(await coefficientSnapshot(dataSource)).toEqual(coefficientsBefore);
  });

  it('rejects cross-tenant estimate references and conflicting idempotency keys', async () => {
    await request(app.getHttpServer())
      .post('/api/estimate-feedback')
      .set(authHeader(userA))
      .send({
        taskId: resourcesA.taskId,
        estimateId: resourcesB.finalEstimateId,
        actualHours: 7,
      })
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/estimate-feedback')
      .set(authHeader(userA))
      .send({
        taskId: resourcesA.taskId,
        estimateId: resourcesA.finalEstimateId,
        idempotencyKey: 'conflicting-feedback-key',
        actualHours: 7,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/estimate-feedback')
      .set(authHeader(userA))
      .send({
        taskId: resourcesA.taskId,
        estimateId: resourcesA.finalEstimateId,
        idempotencyKey: 'conflicting-feedback-key',
        actualHours: 8,
      })
      .expect(409);
  });

  it('prevents user A from reading, updating, deleting, or modifying user B resources', async () => {
    const beforeCounts = {
      projects: await countRows(dataSource, 'projects'),
      tasks: await countRows(dataSource, 'tasks'),
      estimates: await countRows(dataSource, 'estimates'),
      feedback: await countRows(dataSource, 'estimate_feedbacks'),
    };
    const coefficientsBefore = await coefficientSnapshot(dataSource);

    await request(app.getHttpServer())
      .get(`/api/projects/${resourcesB.projectId}`)
      .set(authHeader(userA))
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/projects/${resourcesB.projectId}`)
      .set(authHeader(userA))
      .send({ name: 'User A takeover attempt' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/projects/${resourcesB.projectId}`)
      .set(authHeader(userA))
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/tasks')
      .set(authHeader(userA))
      .send({
        projectId: resourcesB.projectId,
        title: 'Cross-tenant task',
        description:
          'This unauthorized task must not be created in another project.',
        technology: 'Node.js',
        experienceLevel: 'MIDDLE',
        breakdown: false,
      })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/api/tasks/${resourcesB.taskId}`)
      .set(authHeader(userA))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/tasks/${resourcesB.taskId}`)
      .set(authHeader(userA))
      .send({ title: 'User A task takeover attempt', manualEstimate: 99 })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/tasks/${resourcesB.taskId}`)
      .set(authHeader(userA))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/estimates/${resourcesB.estimateId}`)
      .set(authHeader(userA))
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/estimates')
      .set(authHeader(userA))
      .send({
        taskId: resourcesB.taskId,
        finalEstimate: 123,
        source: EstimateSource.MANUAL,
      })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/estimates/${resourcesB.estimateId}`)
      .set(authHeader(userA))
      .send({ finalEstimate: 123 })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/estimates/${resourcesB.estimateId}/manager-explanation`)
      .set(authHeader(userA))
      .send({ explanation: 'Cross-tenant manager explanation' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/estimates/${resourcesB.estimateId}`)
      .set(authHeader(userA))
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/estimate-feedback')
      .set(authHeader(userA))
      .send({
        taskId: resourcesB.taskId,
        actualHours: 100,
        rating: 1,
        reasonForDeviation: 'UNFORESEEN_TECHNICAL_COMPLEXITY',
        missedComplexityTags: ['legacy_code', 'new_infra'],
      })
      .expect(404);

    expect(await countRows(dataSource, 'projects')).toBe(beforeCounts.projects);
    expect(await countRows(dataSource, 'tasks')).toBe(beforeCounts.tasks);
    expect(await countRows(dataSource, 'estimates')).toBe(
      beforeCounts.estimates
    );
    expect(await countRows(dataSource, 'estimate_feedbacks')).toBe(
      beforeCounts.feedback
    );
    expect(await coefficientSnapshot(dataSource)).toEqual(coefficientsBefore);

    const bProject = await request(app.getHttpServer())
      .get(`/api/projects/${resourcesB.projectId}`)
      .set(authHeader(userB))
      .expect(200);
    expect(bProject.body.name).toBe('User B Project');

    const bTask = await request(app.getHttpServer())
      .get(`/api/tasks/${resourcesB.taskId}`)
      .set(authHeader(userB))
      .expect(200);
    expect(bTask.body.title).toBe('User B Task');

    const bEstimate = await request(app.getHttpServer())
      .get(`/api/estimates/${resourcesB.estimateId}`)
      .set(authHeader(userB))
      .expect(200);
    expect(bEstimate.body.finalEstimate).toBe(8);
  });

  it('runs with synchronize:false and has zero pending schema SQL after real HTTP operations', async () => {
    expect(dataSource.options.synchronize).toBe(false);

    const schemaLog = await dataSource.driver.createSchemaBuilder().log();
    expect(schemaLog.upQueries).toHaveLength(0);
    expect(schemaLog.downQueries).toHaveLength(0);
  });
});
