import { INestApplication } from '@nestjs/common';
import { createAppValidationPipe } from '../../validation.pipe';
import { UsersService } from '../users/users.service';
import { ProjectsService } from '../projects/projects.service';
import { TasksService } from '../tasks/tasks.service';
import { EstimatesService } from '../estimates/estimates.service';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '../../app.module';
import { AiEstimatorService } from '../ai-estimator/ai-estimator.service';
import {
  applyRuntimePostgresEnv,
  assertDisposableDockerIsolation,
  assertDisposablePostgresConfig,
  buildDisposableDatabaseName,
  createAdminDataSource,
  createFreshDatabase,
  createTargetDataSource,
  initializeWithRetry,
  readDisposablePostgresConfig,
  verifyNoApplicationTables,
  verifyTargetIdentity,
} from '../../database/testing/disposable-postgres-test-environment';

describe('Mass assignment security (disposable PostgreSQL)', () => {
  let app: INestApplication;
  let db: DataSource;
  let owner: any;
  let other: any;
  let projectId: string;
  let otherProjectId: string;
  let taskId: string;
  let estimateId: string;
  let victimTaskId: string;
  let victimEstimateId: string;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    const config = readDisposablePostgresConfig(
      buildDisposableDatabaseName('ai_estimator_integration_test_massassign')
    );
    assertDisposablePostgresConfig(config);
    assertDisposableDockerIsolation(config);
    const admin = createAdminDataSource(config);
    await initializeWithRetry(admin);
    try {
      await createFreshDatabase(admin, config);
    } finally {
      await admin.destroy();
    }
    const target = createTargetDataSource(config);
    await initializeWithRetry(target);
    try {
      await verifyTargetIdentity(target, config);
      await verifyNoApplicationTables(target);
      await target.runMigrations({ transaction: 'all' });
    } finally {
      await target.destroy();
    }
    applyRuntimePostgresEnv(config);
    process.env.JWT_ACCESS_SECRET =
      'mass-assignment-access-secret-32-characters';
    process.env.JWT_REFRESH_SECRET =
      'mass-assignment-refresh-secret-32-characters';
    process.env.OPENAI_API_KEY = 'not-used-in-security-tests';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiEstimatorService)
      .useValue({
        createInitialAnalysis: jest.fn().mockResolvedValue({
          type: 'estimate',
          data: {
            subtasks: [
              {
                title: 'Implementation',
                description: 'Implementation',
                estimateHours: 4,
                explanation: 'Fixture',
              },
            ],
            risks: [],
            questions: null,
          },
        }),
        computeCalibratedEstimate: jest.fn().mockResolvedValue({
          p10: 3,
          p50: 4,
          p90: 5,
          confidence: 70,
          explanation: 'Fixture',
          logs: [],
          topDown: 4,
          bottomUp: 4,
          divergencePct: 0,
        }),
      })
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createAppValidationPipe());
    await app.init();
    db = app.get(DataSource);
    await verifyTargetIdentity(db, config);
    owner = await register('owner-hotfix@example.com');
    other = await register('other-hotfix@example.com');
    projectId = (await createProject(owner, 'Owner project')).id;
    otherProjectId = (await createProject(other, 'Other project')).id;
    const [task] = await db.query(
      `INSERT INTO tasks (title, "projectId", "experienceLevel") VALUES ($1, $2, 'MIDDLE') RETURNING id`,
      ['Owner task', projectId]
    );
    taskId = task.id;
    const [estimate] = await db.query(
      `INSERT INTO estimates ("taskId", "finalEstimate", source) VALUES ($1, 8, 'final') RETURNING id`,
      [taskId]
    );
    estimateId = estimate.id;
    // Keep microseconds in the fixtures so a millisecond-only comparison cannot
    // accidentally pass after a timestamp has changed.
    const [victimTask] = await db.query(
      `INSERT INTO tasks (title, description, "projectId", "experienceLevel", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'SENIOR', '2020-01-02 03:04:05.123456', '2020-02-03 04:05:06.654321') RETURNING id`,
      ['Victim task', 'Must remain unchanged', otherProjectId]
    );
    victimTaskId = victimTask.id;
    const [victimEstimate] = await db.query(
      `INSERT INTO estimates ("taskId", "finalEstimate", explanation, source, "createdAt", "updatedAt")
       VALUES ($1, 13, 'Victim estimate', 'final', '2020-03-04 05:06:07.123456', '2020-04-05 06:07:08.654321') RETURNING id`,
      [victimTaskId]
    );
    victimEstimateId = victimEstimate.id;
  });

  afterAll(async () => {
    if (app) await app.close();
    process.env = originalEnv;
  });

  const register = async (email: string) => {
    const result = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'original-password-123' })
      .expect(201);
    return result.body;
  };

  const createProject = async (user: any, name: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/projects')
      .auth(user.accessToken, { type: 'bearer' })
      .send({
        name,
        description: 'Project form description',
        complexity: 'MEDIUM',
        overhead: 15,
      })
      .expect(201);
    return response.body;
  };

  const snapshotApplicationRows = async () => {
    // PostgreSQL JSON preserves the complete rows and exact timestamp strings;
    // pg's normal Date conversion would discard the last three fractional digits.
    const [snapshot] = await db.query(`
      SELECT
        (SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM users u) AS users,
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM projects p) AS projects,
        (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM tasks t) AS tasks,
        (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM estimates e) AS estimates
    `);
    return snapshot;
  };

  const expectNoWrites = async (operation: () => PromiseLike<unknown>) => {
    const before = await snapshotApplicationRows();
    await operation();
    expect(await snapshotApplicationRows()).toStrictEqual(before);
  };

  const snapshotForeignVictims = async () => {
    const snapshot = await snapshotApplicationRows();
    return {
      user: snapshot.users.find((row: any) => row.id === other.user.id),
      project: snapshot.projects.find((row: any) => row.id === otherProjectId),
      task: snapshot.tasks.find((row: any) => row.id === victimTaskId),
      estimate: snapshot.estimates.find(
        (row: any) => row.id === victimEstimateId
      ),
    };
  };

  const validTask = () => ({
    projectId,
    title: 'Frontend task',
    description: 'Frontend task description',
    technology: 'Node.js',
    experienceLevel: 'MIDDLE',
    tags: ['backend'],
    useAiEstimate: true,
    breakdown: false,
    manualEstimate: 0,
    acceptanceCriteria: ['Works'],
    assumptions: [],
    constraints: [],
    complexityTags: ['legacy_code'],
    nfrs: [{ category: 'performance', requirement: 'Fast', target: '100ms' }],
    integrations: [
      {
        name: 'Example',
        type: 'external',
        interaction: 'read',
        auth: 'api_key',
        sandbox: true,
      },
    ],
    testing: {
      unit: true,
      integration: false,
      e2e: false,
      unitCoverageTarget: 0,
      performance: false,
      security: false,
    },
    documentation: {
      userDocs: false,
      apiDocs: false,
      readme: false,
      changelog: false,
    },
    uiDesignComplexity: 'NONE',
    needsDataMigration: false,
    migrationComplexity: 'LOW',
    generateManagerNote: false,
    generateRiskAnalysis: false,
  });

  it('preserves exact PostgreSQL timestamp precision in complete victim snapshots', async () => {
    const snapshot = await snapshotApplicationRows();
    expect(
      snapshot.tasks.find((row: any) => row.id === victimTaskId)
    ).toMatchObject({
      projectId: otherProjectId,
      createdAt: '2020-01-02T03:04:05.123456',
      updatedAt: '2020-02-03T04:05:06.654321',
    });
    expect(
      snapshot.estimates.find((row: any) => row.id === victimEstimateId)
    ).toMatchObject({
      taskId: victimTaskId,
      createdAt: '2020-03-04T05:06:07.123456',
      updatedAt: '2020-04-05T06:07:08.654321',
    });
  });

  it('rejects an injected registration ID and preserves the complete existing account', async () => {
    const before = await snapshotApplicationRows();
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        id: owner.user.id,
        email: 'takeover-hotfix@example.com',
        password: 'attacker-password-123',
      })
      .expect(400);
    expect(response.body.message).toContain('property id should not exist');
    expect(response.body.accessToken).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await snapshotApplicationRows()).toStrictEqual(before);
    expect(
      await db.query('SELECT id FROM users WHERE email = $1', [
        'takeover-hotfix@example.com',
      ])
    ).toHaveLength(0);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: owner.user.email, password: 'original-password-123' })
      .expect(200);
  });

  it.each([
    'userId',
    'role',
    'isAdmin',
    'refreshToken',
    'projects',
    'unexpected',
  ])('rejects registration field %s', async (field) => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'rejected-hotfix@example.com',
        password: 'valid-password-123',
        [field]: 'injected',
      })
      .expect(400);
  });

  it('keeps valid registration and response contracts', async () => {
    const response = await register('valid-hotfix@example.com');
    expect(response.accessToken).toEqual(expect.any(String));
    expect(response.user).toEqual({
      id: expect.any(String),
      email: 'valid-hotfix@example.com',
    });
    const [stored] = await db.query(
      'SELECT password FROM users WHERE id = $1',
      [response.user.id]
    );
    expect(stored.password).not.toBe('original-password-123');
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: response.user.email, password: 'original-password-123' })
      .expect(200);
  });

  it('rejects injected IDs on authenticated user creation too', async () => {
    await expectNoWrites(() =>
      request(app.getHttpServer())
        .post('/api/users')
        .auth(owner.accessToken, { type: 'bearer' })
        .send({
          id: other.user.id,
          email: 'users-endpoint-hotfix@example.com',
          password: 'valid-password-123',
        })
        .expect(400)
    );
  });

  it('rejects an unused profile ID for an account without dependent records', async () => {
    const standalone = await register('standalone-profile-hotfix@example.com');
    const unusedId = randomUUID();
    expect(
      await db.query('SELECT id FROM users WHERE id = $1', [unusedId])
    ).toHaveLength(0);
    expect(
      await db.query('SELECT id FROM projects WHERE "userId" = $1', [
        standalone.user.id,
      ])
    ).toHaveLength(0);
    for (const table of [
      'tenant_calibration_coefficients',
      'coefficient_change_events',
    ]) {
      expect(
        await db.query(`SELECT id FROM ${table} WHERE "tenantUserId" = $1`, [
          standalone.user.id,
        ])
      ).toHaveLength(0);
    }
    // There are no foreign-key dependants to accidentally prevent a primary-key write.
    await expectNoWrites(() =>
      request(app.getHttpServer())
        .patch(`/api/users/${standalone.user.id}`)
        .auth(standalone.accessToken, { type: 'bearer' })
        .send({ id: unusedId, email: 'must-not-change-hotfix@example.com' })
        .expect(400)
    );
    expect(
      await db.query('SELECT id FROM users WHERE id = $1', [unusedId])
    ).toHaveLength(0);
    await request(app.getHttpServer())
      .get(`/api/users/${standalone.user.id}`)
      .auth(standalone.accessToken, { type: 'bearer' })
      .expect(200);
  });

  it('rejects project ID injection without changing the victim project', async () => {
    const before = await snapshotApplicationRows();
    await request(app.getHttpServer())
      .post('/api/projects')
      .auth(owner.accessToken, { type: 'bearer' })
      .send({
        id: otherProjectId,
        name: 'Taken',
        description: 'Taken description',
      })
      .expect(400);
    expect(await snapshotApplicationRows()).toStrictEqual(before);
  });

  it.each(['userId', 'user', 'tasks', 'role', 'isAdmin', 'unexpected'])(
    'rejects project creation field %s',
    async (field) => {
      await expectNoWrites(() =>
        request(app.getHttpServer())
          .post('/api/projects')
          .auth(owner.accessToken, { type: 'bearer' })
          .send({
            name: 'Rejected',
            description: 'Rejected description',
            [field]: other.user.id,
          })
          .expect(400)
      );
    }
  );

  it('keeps valid project creation, ownership and defaults', async () => {
    const result = await createProject(owner, 'Valid frontend project');
    expect(result).toMatchObject({
      id: expect.any(String),
      name: 'Valid frontend project',
      userId: owner.user.id,
      overhead: 15,
    });
    const defaults = await request(app.getHttpServer())
      .post('/api/projects')
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ name: 'Defaults', description: 'Default project description' })
      .expect(201);
    expect(defaults.body).toMatchObject({
      complexity: 'MEDIUM',
      overhead: 0,
      userId: owner.user.id,
    });
  });

  describe.each(['POST', 'PATCH', 'PATCH details'])(
    '%s project victim-object injection',
    (endpoint) => {
      it.each(['user', 'tasks', 'tasks with estimates'])(
        'rejects nested %s without changing any victim rows',
        async (attack) => {
          const injected =
            attack === 'user'
              ? { user: { id: other.user.id } }
              : {
                  tasks: [
                    {
                      id: victimTaskId,
                      title: 'tampered',
                      ...(attack === 'tasks with estimates'
                        ? {
                            estimates: [
                              {
                                id: victimEstimateId,
                                finalEstimate: 999,
                                explanation: 'tampered',
                                createdAt: '1970-01-01T00:00:00.000001',
                                updatedAt: '1970-01-01T00:00:00.000002',
                              },
                            ],
                          }
                        : {}),
                    },
                  ],
                };
          await expectNoWrites(() => {
            const client = request(app.getHttpServer());
            const operation =
              endpoint === 'POST'
                ? client.post('/api/projects')
                : client.patch(
                    `/api/projects/${projectId}${
                      endpoint === 'PATCH details' ? '/details' : ''
                    }`
                  );
            return operation
              .auth(owner.accessToken, { type: 'bearer' })
              .send({
                name: 'Must not persist',
                description: 'Must not persist',
                ...injected,
              })
              .expect(400);
          });
        }
      );
    }
  );

  it.each(['id', 'userId', 'user', 'tasks', 'isAdmin'])(
    'rejects project update field %s',
    async (field) => {
      for (const suffix of ['', '/details']) {
        await expectNoWrites(() =>
          request(app.getHttpServer())
            .patch(`/api/projects/${projectId}${suffix}`)
            .auth(owner.accessToken, { type: 'bearer' })
            .send({ name: 'Must not persist', [field]: other.user.id })
            .expect(400)
        );
      }
      const [stored] = await db.query(
        'SELECT name, "userId" FROM projects WHERE id = $1',
        [projectId]
      );
      expect(stored).toEqual({ name: 'Owner project', userId: owner.user.id });
    }
  );

  it.each(['id', 'userId', 'role', 'isAdmin', 'refreshToken', 'projects'])(
    'rejects profile field %s',
    async (field) => {
      await expectNoWrites(() =>
        request(app.getHttpServer())
          .patch(`/api/users/${owner.user.id}`)
          .auth(owner.accessToken, { type: 'bearer' })
          .send({ [field]: other.user.id })
          .expect(400)
      );
    }
  );

  it.each([
    'id',
    'project',
    'parentTask',
    'estimates',
    'feedbacks',
    'status',
    'userId',
  ])('rejects task creation/update field %s', async (field) => {
    await request(app.getHttpServer())
      .post('/api/tasks')
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ ...validTask(), [field]: otherProjectId })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ title: 'Must not persist', [field]: otherProjectId })
      .expect(400);
  });

  it('rejects unknown nested task properties and clarification fields', async () => {
    const payload = validTask();
    for (const field of ['testing', 'documentation']) {
      await request(app.getHttpServer())
        .post('/api/tasks')
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ ...payload, [field]: { ...payload[field], isAdmin: true } })
        .expect(400);
    }
    for (const field of ['nfrs', 'integrations']) {
      await request(app.getHttpServer())
        .post('/api/tasks')
        .auth(owner.accessToken, { type: 'bearer' })
        .send({
          ...payload,
          [field]: [{ ...payload[field][0], isAdmin: true }],
        })
        .expect(400);
    }
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/clarify`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({
        clarifications: [
          { question: 'Q', answer: 'A', projectId: otherProjectId },
        ],
      })
      .expect(400);
  });

  it.each([false, true])(
    'accepts the complete frontend task creation payload (breakdown=%s)',
    async (breakdown) => {
      const result = await request(app.getHttpServer())
        .post('/api/tasks')
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ ...validTask(), breakdown })
        .expect(201);
      expect(result.body).toMatchObject({
        title: 'Frontend task',
        experienceLevel: 'MIDDLE',
      });
      expect(
        result.body.estimates.some(
          (estimate: any) => estimate.source === 'final'
        )
      ).toBe(true);
    }
  );

  it.each(['id', 'task', 'role', 'isAdmin', 'createdAt'])(
    'rejects estimate creation/update field %s',
    async (field) => {
      const injected = {
        id: victimEstimateId,
        task: { id: victimTaskId },
        role: 'admin',
        isAdmin: true,
        createdAt: '1970-01-01T00:00:00.000001',
      }[field];
      await expectNoWrites(() =>
        request(app.getHttpServer())
          .post('/api/estimates')
          .auth(owner.accessToken, { type: 'bearer' })
          .send({
            taskId,
            finalEstimate: 7,
            source: 'manual',
            [field]: injected,
          })
          .expect(400)
      );
      await expectNoWrites(() =>
        request(app.getHttpServer())
          .patch(`/api/estimates/${estimateId}`)
          .auth(owner.accessToken, { type: 'bearer' })
          .send({ finalEstimate: 7, [field]: injected })
          .expect(400)
      );
      const [victim] = await db.query(
        `SELECT e.id, e."taskId", t."projectId", p."userId"
         FROM estimates e JOIN tasks t ON t.id = e."taskId"
         JOIN projects p ON p.id = t."projectId" WHERE e.id = $1`,
        [victimEstimateId]
      );
      expect(victim).toEqual({
        id: victimEstimateId,
        taskId: victimTaskId,
        projectId: otherProjectId,
        userId: other.user.id,
      });
    }
  );

  it('rejects hidden fields on explanation and feedback writes', async () => {
    await expectNoWrites(() =>
      request(app.getHttpServer())
        .patch(`/api/estimates/${estimateId}/manager-explanation`)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ explanation: 'Allowed text', task: { id: victimTaskId } })
        .expect(400)
    );
    await expectNoWrites(() =>
      request(app.getHttpServer())
        .post('/api/estimate-feedback')
        .auth(owner.accessToken, { type: 'bearer' })
        .send({ taskId, actualHours: 9, processingStatus: 'processed' })
        .expect(400)
    );
  });

  it('keeps legitimate profile, project, task, estimate, explanation and feedback updates', async () => {
    const profile = await request(app.getHttpServer())
      .patch(`/api/users/${owner.user.id}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({
        email: 'owner-updated-hotfix@example.com',
        password: 'ignored-as-before-123',
      })
      .expect(200);
    expect(profile.body).toEqual({
      id: owner.user.id,
      email: 'owner-updated-hotfix@example.com',
    });
    owner.user.email = profile.body.email;
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: owner.user.email, password: 'original-password-123' })
      .expect(200);
    for (const suffix of ['', '/details']) {
      await request(app.getHttpServer())
        .patch(`/api/projects/${projectId}${suffix}`)
        .auth(owner.accessToken, { type: 'bearer' })
        .send({
          name: 'Updated project',
          description: 'Updated description',
          complexity: 'HIGH',
          overhead: 20,
        })
        .expect(200);
    }
    const { projectId: _projectId, ...taskChanges } = validTask();
    const task = await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ ...taskChanges, manualEstimate: 6 })
      .expect(200);
    expect(task.body).toMatchObject({
      title: 'Frontend task',
      testing: { unit: true },
    });
    const estimate = await request(app.getHttpServer())
      .patch(`/api/estimates/${estimateId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({
        finalEstimate: 9,
        confidence: 0.8,
        explanation: 'Updated',
        p10: 7,
        p50: 9,
        p90: 11,
      })
      .expect(200);
    expect(estimate.body.finalEstimate).toBe(9);
    await request(app.getHttpServer())
      .patch(`/api/estimates/${estimateId}/manager-explanation`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ explanation: 'Manager explanation' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/estimate-feedback')
      .auth(owner.accessToken, { type: 'bearer' })
      .send({
        taskId,
        actualHours: 9,
        reasonForDeviation: 'ESTIMATE_WAS_ACCURATE',
        rating: 5,
        missedComplexityTags: [],
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(
        `/api/projects/${projectId}?tree=true&sortBy=createdAt&sortOrder=DESC`
      )
      .auth(owner.accessToken, { type: 'bearer' })
      .expect(200);
  });

  it('does not reparent tasks through projectId', async () => {
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ projectId: otherProjectId })
      .expect(400);
    const [stored] = await db.query(
      'SELECT "projectId" FROM tasks WHERE id = $1',
      [taskId]
    );
    expect(stored.projectId).toBe(projectId);
  });

  it('preserves declared estimate userId compatibility without trusting it for ownership', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/estimates')
      .auth(owner.accessToken, { type: 'bearer' })
      .send({
        taskId,
        finalEstimate: 7,
        source: 'manual',
        userId: other.user.id,
      })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/estimates/${response.body.id}`)
      .auth(other.accessToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send({ projectId, useAiEstimate: true })
      .expect(200);
  });

  it('does not persist hidden fields during direct service updates', async () => {
    const foreignBefore = await snapshotForeignVictims();
    const before = await snapshotApplicationRows();
    const originalEstimate = before.estimates.find(
      (row: any) => row.id === estimateId
    );
    await app
      .get(UsersService)
      .updateOwn(
        owner.user.id,
        Object.assign(
          { email: owner.user.email },
          { id: other.user.id, refreshToken: 'injected', projects: [] }
        ),
        owner.user.id
      );
    await app
      .get(ProjectsService)
      .update(
        projectId,
        Object.assign(
          { name: 'Service-safe project' },
          { id: otherProjectId, userId: other.user.id, tasks: [] }
        ),
        owner.user.id
      );
    await app.get(TasksService).update(
      taskId,
      Object.assign(
        { title: 'Service-safe task' },
        {
          project: { id: otherProjectId },
          parentTask: { id: taskId },
          id: otherProjectId,
        }
      ),
      owner.user.id
    );
    await app.get(EstimatesService).update(
      estimateId,
      Object.assign(
        { finalEstimate: 10 },
        {
          task: { id: victimTaskId },
          id: victimEstimateId,
          createdAt: new Date(0),
        }
      ),
      owner.user.id
    );
    const [project] = await db.query(
      'SELECT name, "userId" FROM projects WHERE id = $1',
      [projectId]
    );
    expect(project).toEqual({
      name: 'Service-safe project',
      userId: owner.user.id,
    });
    const [task] = await db.query(
      'SELECT title, "projectId", "parentTaskId" FROM tasks WHERE id = $1',
      [taskId]
    );
    expect(task).toEqual({
      title: 'Service-safe task',
      projectId,
      parentTaskId: null,
    });
    const after = await snapshotApplicationRows();
    const estimate = after.estimates.find((row: any) => row.id === estimateId);
    expect(estimate.finalEstimate).toBe(10);
    expect(estimate.taskId).toBe(taskId);
    expect(estimate.createdAt).toBe(originalEstimate.createdAt);
    expect(await snapshotForeignVictims()).toStrictEqual(foreignBefore);
  });

  it('ignores injected primary keys even if a caller bypasses the HTTP validation pipe', async () => {
    const before = await snapshotForeignVictims();
    const account = await app.get(UsersService).create(
      Object.assign(
        {
          email: 'service-hotfix@example.com',
          password: 'valid-password-123',
        },
        { id: other.user.id, refreshToken: 'injected' }
      )
    );
    expect(account.id).not.toBe(other.user.id);
    const project = await app
      .get(ProjectsService)
      .create(
        Object.assign(
          { name: 'Service project', description: 'Description' },
          { id: otherProjectId, userId: other.user.id }
        ),
        owner.user.id
      );
    expect(project.id).not.toBe(otherProjectId);
    expect(project.userId).toBe(owner.user.id);
    const [victim] = await db.query('SELECT email FROM users WHERE id = $1', [
      other.user.id,
    ]);
    expect(victim.email).toBe(other.user.email);
    const [stored] = await db.query(
      'SELECT "refreshToken" FROM users WHERE id = $1',
      [account.id]
    );
    expect(stored.refreshToken).toBeNull();
    expect(await snapshotForeignVictims()).toStrictEqual(before);
  });

  it('rotates HttpOnly refresh cookies across login, refresh and logout', async () => {
    const email = `cookie-rotation-${randomUUID()}@example.com`;
    const password = 'integration-cookie-password-123';
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.body).not.toHaveProperty('refreshToken');
    const loginCookie = login.headers['set-cookie']?.[0] as string;
    expect(loginCookie).toContain('refreshToken=');
    expect(loginCookie).toContain('HttpOnly');
    expect(loginCookie).toContain('SameSite=Lax');

    const refreshed = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', loginCookie)
      .expect(200);
    expect(refreshed.body).toEqual({ accessToken: expect.any(String) });
    const rotatedCookie = refreshed.headers['set-cookie']?.[0] as string;
    expect(rotatedCookie).toContain('refreshToken=');
    expect(rotatedCookie).toContain('HttpOnly');
    expect(rotatedCookie.split(';')[0]).not.toBe(loginCookie.split(';')[0]);

    // Ensure refresh rotation changed the persisted hash, not only the cookie.
    const [{ refreshToken: storedHash }] = await db.query(
      'SELECT "refreshToken" FROM users WHERE email = $1',
      [email]
    );
    const bcrypt = await import('bcrypt');
    const { createHash } = await import('crypto');
    const hashToken = (cookie: string) =>
      createHash('sha256')
        .update(cookie.split(';')[0].slice('refreshToken='.length))
        .digest('hex');
    expect(storedHash).toMatch(/^v2:\\$2[aby]\\$/);
    expect(await bcrypt.compare(hashToken(loginCookie), storedHash.slice(3))).toBe(false);
    expect(await bcrypt.compare(hashToken(rotatedCookie), storedHash.slice(3))).toBe(true);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', loginCookie)
      .expect(403);

    const logout = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .auth(refreshed.body.accessToken, { type: 'bearer' })
      .set('Cookie', rotatedCookie)
      .expect(200);
    expect(logout.body).toEqual({ success: true });
    expect(logout.headers['set-cookie']?.[0]).toContain('refreshToken=');

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', rotatedCookie)
      .expect(403);
  });


});
