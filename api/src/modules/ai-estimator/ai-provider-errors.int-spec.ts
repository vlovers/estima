import { INestApplication } from '@nestjs/common';
import { observeFailureBoundary } from '../../database/testing/mutation-boundary-poc';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../app.module';
import { createAppValidationPipe } from '../../validation.pipe';
import {
  Estimate,
  EstimateSource,
} from '../estimates/entities/estimate.entity';
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

// The real OpenAI SDK talks only to this local HTTP server. No provider credentials or calls.
describe('AI provider failures (real SDK, Nest HTTP and disposable PostgreSQL)', () => {
  let app: INestApplication;
  let db: DataSource;
  let provider: Server;
  let mode = 'success';
  let calls = 0;
  let token: string;
  let projectId: string;
  let remoteIdleTransactions: number[] = [];
  const originalEnv = { ...process.env };
  const marker = 'sensitive-provider-body-must-not-leak';
  const task = (useAiEstimate = true) => ({
    projectId,
    title: `Regression ${randomUUID()}`,
    description:
      'Implement a bounded React form with accessible labels, input validation and unit tests.',
    technology: 'React',
    experienceLevel: 'MIDDLE',
    useAiEstimate,
    breakdown: false,
    manualEstimate: 8,
  });
  const post = (body: object) =>
    request(app.getHttpServer())
      .post('/api/tasks')
      .auth(token, { type: 'bearer' })
      .send(body);

  beforeAll(async () => {
    provider = createServer(async (req, res) => {
      calls++;
      if (db?.isInitialized) {
        const [activity] = await db.query(
          "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction'"
        );
        remoteIdleTransactions.push(activity.count);
      }
      let body = '';
      for await (const chunk of req) body += chunk;
      res.setHeader('Content-Type', 'application/json');
      if (mode !== 'success' && mode !== 'invalid') {
        const status =
          mode === 'auth'
            ? 401
            : mode === 'quota' || mode === 'rate'
            ? 429
            : 503;
        res.writeHead(status);
        res.end(
          JSON.stringify({
            error: {
              message: marker,
              type: mode,
              code: mode === 'quota' ? 'insufficient_quota' : mode,
            },
          })
        );
        return;
      }
      const input = JSON.parse(body);
      const schema = input.response_format?.json_schema?.name;
      const content =
        schema === 'SpecQuality'
          ? JSON.stringify({ score: 0.95, reasons: [], missing: [] })
          : schema === 'ai_estimate_response'
          ? mode === 'invalid'
            ? '{invalid-json'
            : JSON.stringify({
                subtasks: [
                  {
                    title: 'Form',
                    description: 'Implement accessible React form',
                    estimateHours: 4,
                    explanation: 'Fixture scope',
                  },
                  {
                    title: 'Tests',
                    description: 'Cover validation',
                    estimateHours: 2,
                    explanation: 'Fixture tests',
                  },
                ],
                risks: [],
                managerNote: null,
                questions: null,
              })
          : '6';
      res.end(
        JSON.stringify({
          id: 'local-test',
          object: 'chat.completion',
          created: 0,
          model: 'test-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop',
            },
          ],
        })
      );
    });
    await new Promise<void>((resolve) =>
      provider.listen(0, '127.0.0.1', resolve)
    );
    process.env.OPENAI_API_KEY = 'test-only-no-provider-access';
    process.env.OPENAI_BASE_URL = `http://127.0.0.1:${
      (provider.address() as AddressInfo).port
    }/v1`;
    process.env.JWT_ACCESS_SECRET = 'test-only-ai-errors-access-secret-32chars';
    process.env.JWT_REFRESH_SECRET =
      'test-only-ai-errors-refresh-secret-32chars';
    const config = readDisposablePostgresConfig(
      buildDisposableDatabaseName('ai_estimator_integration_test_ai_errors')
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
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createAppValidationPipe());
    await app.init();
    db = app.get(DataSource);
    await verifyTargetIdentity(db, config);
    const account = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `${randomUUID()}@example.test`,
        password: 'test-only-password-123',
      })
      .expect(201);
    token = account.body.accessToken;
    const project = await request(app.getHttpServer())
      .post('/api/projects')
      .auth(token, { type: 'bearer' })
      .send({
        name: 'AI regression',
        description: 'Disposable AI boundary regression project',
        complexity: 'MEDIUM',
        overhead: 15,
      })
      .expect(201);
    projectId = project.body.id;
  });
  afterAll(async () => {
    if (app) await app.close();
    if (provider)
      await new Promise<void>((resolve) => provider.close(() => resolve()));
    process.env = originalEnv;
  });
  beforeEach(() => {
    mode = 'success';
    calls = 0;
    remoteIdleTransactions = [];
  });

  it('creates a manual-only task without contacting an unavailable AI provider', async () => {
    mode = 'quota';
    const result = await post(task(false)).expect(201);
    expect(calls).toBe(0);
    expect(result.body.estimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'manual', finalEstimate: 8 }),
      ])
    );
    const updated = await request(app.getHttpServer())
      .patch(`/api/tasks/${result.body.id}`)
      .auth(token, { type: 'bearer' })
      .send({ manualEstimate: 14 })
      .expect(200);
    expect(updated.body.estimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'manual',
          manualEstimate: 14,
          finalEstimate: 14,
        }),
      ])
    );
  });

  it.each(['quota', 'auth', 'rate', 'unavailable'])(
    'returns a sanitized 503 for provider %s and leaves no partial task',
    async (failure) => {
      mode = failure;
      const input = task();
      const result = await post(input).expect(503);
      expect(result.body.message).toEqual(expect.any(String));
      expect(JSON.stringify(result.body)).not.toContain(marker);
      expect(JSON.stringify(result.body)).not.toContain(
        'test-only-no-provider-access'
      );
      expect(
        await db.query('SELECT id FROM tasks WHERE title = $1', [input.title])
      ).toHaveLength(0);
    }
  );

  it('returns a sanitized 502 for malformed AI output before persistence', async () => {
    mode = 'invalid';
    const input = task();
    await post(input).expect(502);
    expect(
      await db.query('SELECT id FROM tasks WHERE title = $1', [input.title])
    ).toHaveLength(0);
  });

  it('persists AI and final estimates through the real SDK response path', async () => {
    const result = await post(task()).expect(201);
    expect(calls).toBe(3); // Quality, analysis and top-down cross-check.
    expect(remoteIdleTransactions).toEqual([0, 0, 0]);
    const loaded = await request(app.getHttpServer())
      .get(`/api/tasks/${result.body.id}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(loaded.body.estimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'ai', finalEstimate: 6 }),
        expect.objectContaining({
          source: 'final',
          finalEstimate: expect.any(Number),
        }),
      ])
    );
    expect(
      await db.query('SELECT id FROM estimates WHERE "taskId" = $1', [
        result.body.id,
      ])
    ).toHaveLength(2);
    const updated = await request(app.getHttpServer())
      .patch(`/api/tasks/${result.body.id}`)
      .auth(token, { type: 'bearer' })
      .send({ manualEstimate: 14 })
      .expect(200);
    expect(
      updated.body.estimates.find(
        (estimate: { source: string }) => estimate.source === 'final'
      )
    ).toMatchObject({ manualEstimate: 14 });
    expect(
      updated.body.estimates.map(
        (estimate: { finalEstimate: number }) => estimate.finalEstimate
      )
    ).toEqual(
      loaded.body.estimates.map(
        (estimate: { finalEstimate: number }) => estimate.finalEstimate
      )
    );
  });

  it.each([0, -1, null])(
    'rejects invalid manual hours %s on create and update without changing data',
    async (hours) => {
      const original = await post(task(false)).expect(201);
      const input = { ...task(false), manualEstimate: hours };
      await post(input).expect(400);
      await request(app.getHttpServer())
        .patch(`/api/tasks/${original.body.id}`)
        .auth(token, { type: 'bearer' })
        .send({ manualEstimate: hours, title: 'Must not change' })
        .expect(400);
      const loaded = await request(app.getHttpServer())
        .get(`/api/tasks/${original.body.id}`)
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(loaded.body.title).toBe(original.body.title);
      expect(loaded.body.estimates[0]).toMatchObject({
        finalEstimate: 8,
        manualEstimate: 8,
      });
      expect(
        await db.query('SELECT id FROM tasks WHERE title = $1', [input.title])
      ).toHaveLength(0);
      expect(calls).toBe(0);
    }
  );

  it('requires hours for manual-only creation, keeps AI hours optional, and accepts positive fractions', async () => {
    const { manualEstimate: _manual, ...manual } = task(false);
    await post(manual).expect(400);
    const fractional = await post({ ...manual, manualEstimate: 0.25 }).expect(
      201
    );
    expect(fractional.body.status).toBe('estimated');
    expect(fractional.body.estimates[0]).toMatchObject({
      finalEstimate: 0.25,
      manualEstimate: 0.25,
    });
    await request(app.getHttpServer())
      .patch(`/api/tasks/${fractional.body.id}`)
      .auth(token, { type: 'bearer' })
      .send({ title: 'Unchanged reference' })
      .expect(200);
    const { manualEstimate: _aiManual, ...ai } = task();
    await post(ai).expect(201);
    expect(calls).toBe(3);
  });

  // Fail inside PostgreSQL, rather than mocking a service or a repository. All
  // trigger changes are confined to this suite's freshly created database.
  const failEstimateWrites = async (
    source: 'manual' | 'final',
    operation: () => Promise<void>
  ) => {
    await db.query(
      `CREATE FUNCTION pr9_fail_estimate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source = '${source}' THEN RAISE EXCEPTION 'controlled PR9 persistence failure'; END IF; RETURN NEW; END $$`
    );
    await db.query(
      'CREATE TRIGGER pr9_estimate_failure BEFORE INSERT ON estimates FOR EACH ROW EXECUTE FUNCTION pr9_fail_estimate()'
    );
    try {
      await operation();
    } finally {
      await db.query('DROP TRIGGER pr9_estimate_failure ON estimates');
      await db.query('DROP FUNCTION pr9_fail_estimate()');
    }
  };
  const rowCounts = async () => {
    const [counts] = await db.query(
      'SELECT (SELECT count(*)::int FROM tasks) AS tasks, (SELECT count(*)::int FROM estimates) AS estimates'
    );
    return counts;
  };

  it('rolls back a manual-only task when its estimate insert fails', async () => {
    const before = await rowCounts();
    await failEstimateWrites('manual', async () => {
      const result = await post(task(false)).expect(500);
      expect(JSON.stringify(result.body)).not.toContain('controlled PR9');
    });
    expect(await rowCounts()).toEqual(before);
    expect(calls).toBe(0);
  });

  it.each([true, false])(
    'rolls back AI parent, children and estimates if final persistence fails (breakdown %s)',
    async (breakdown) => {
      const before = await rowCounts();
      await failEstimateWrites('final', async () => {
        await post({ ...task(), breakdown }).expect(500);
      });
      expect(await rowCounts()).toEqual(before);
      expect(calls).toBe(3);
      expect(remoteIdleTransactions).toEqual([0, 0, 0]);
    }
  );

  it('MutationBoundary PoC: detects partial clarification writes after a failed final estimate', async () => {
    // A real pending clarification task; only this suite's disposable DB is touched.
    const created = await post({ ...task(false), breakdown: true }).expect(201);
    const id = created.body.id as string;
    const question = 'What are the accessibility requirements?';
    await db.query(
      'UPDATE tasks SET status = $1, "clarificationHistory" = $2::jsonb WHERE id = $3',
      ['pending_clarification', JSON.stringify([{ question, answer: '' }]), id]
    );
    await failEstimateWrites('final', async () => {
      const changes = await observeFailureBoundary(
        db,
        [{ name: 'tasks', key: 'id' }, { name: 'estimates', key: 'id' }],
        async () => {
          await request(app.getHttpServer())
            .patch(`/api/tasks/${id}/clarify`)
            .auth(token, { type: 'bearer' })
            .send({ clarifications: [{ question, answer: 'WCAG AA' }] })
            .expect(500);
        }
      );
      // This is a characterization test of the known bug, not a test of the fix.
      expect(changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: 'tasks', kind: 'updated', key: expect.any(String) }),
        ])
      );
      expect(
        changes.some((change) =>
          change.table === 'tasks' &&
          change.kind === 'updated' &&
          change.before?.status === 'pending_clarification' &&
          change.after?.status === 'estimated'
        )
      ).toBe(true);
    });
  });

  const seedSources = async (sources: EstimateSource[]) => {
    const result = await post(task(false)).expect(201);
    const id = result.body.id;
    await db.getRepository(Estimate).delete({ task: { id } });
    for (const source of sources) {
      await db.getRepository(Estimate).insert({
        task: { id },
        source,
        finalEstimate: source === EstimateSource.MANUAL ? 0 : 6,
        manualEstimate: 8,
        confidence: 0.7,
        explanation: 'Historical fixture',
      });
    }
    return id;
  };

  it.each([
    [EstimateSource.FINAL, EstimateSource.AI_SUBTASK_SUM, EstimateSource.AI],
    [EstimateSource.AI_SUBTASK_SUM, EstimateSource.AI],
    [EstimateSource.AI],
    [
      EstimateSource.MANUAL,
      EstimateSource.MANUAL,
      EstimateSource.FINAL,
      EstimateSource.AI_SUBTASK_SUM,
      EstimateSource.AI,
    ],
  ])(
    'updates the preferred reference while preserving historical AI data for %j',
    async (...sources) => {
      const id = await seedSources(sources);
      const rows = () =>
        db
          .getRepository(Estimate)
          .find({ where: { task: { id } }, order: { id: 'ASC' } });
      const before = await rows();
      await request(app.getHttpServer())
        .patch(`/api/tasks/${id}`)
        .auth(token, { type: 'bearer' })
        .send({ manualEstimate: 14 })
        .expect(200);
      const after = await rows();
      for (const old of before) {
        const updated = after.find((row) => row.id === old.id)!;
        expect(updated.confidence).toBe(old.confidence);
        expect(updated.explanation).toBe(old.explanation);
        expect(updated.manualEstimate).toBe(old.source === sources[0] ? 14 : 8);
        expect(updated.finalEstimate).toBe(
          old.source === EstimateSource.MANUAL ? 14 : old.finalEstimate
        );
      }
    }
  );

  it('serializes concurrent reference creation and returns each committed update without duplicates', async () => {
    const id = await seedSources([]);
    const responses = await Promise.all(
      [14, 18].map((manualEstimate) =>
        request(app.getHttpServer())
          .patch(`/api/tasks/${id}`)
          .auth(token, { type: 'bearer' })
          .send({ manualEstimate })
          .expect(200)
      )
    );
    responses.forEach((response, index) =>
      expect(response.body.estimates).toEqual([
        expect.objectContaining({
          source: 'manual',
          manualEstimate: [14, 18][index],
          finalEstimate: [14, 18][index],
        }),
      ])
    );
    const stored = await db
      .getRepository(Estimate)
      .find({ where: { task: { id } } });
    expect(stored).toHaveLength(1);
    expect([14, 18]).toContain(stored[0].manualEstimate);
    expect(stored[0].finalEstimate).toBe(stored[0].manualEstimate);
  });

  it('preserves a concurrent final-hours edit while updating the manual reference', async () => {
    const id = await seedSources([EstimateSource.FINAL, EstimateSource.AI]);
    const final = await db
      .getRepository(Estimate)
      .findOneByOrFail({ task: { id }, source: EstimateSource.FINAL });
    await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/tasks/${id}`)
        .auth(token, { type: 'bearer' })
        .send({ manualEstimate: 14 })
        .expect(200),
      request(app.getHttpServer())
        .patch(`/api/estimates/${final.id}`)
        .auth(token, { type: 'bearer' })
        .send({ finalEstimate: 99 })
        .expect(200),
    ]);
    expect(
      await db.getRepository(Estimate).findOneByOrFail({ id: final.id })
    ).toMatchObject({ finalEstimate: 99, manualEstimate: 14 });
  });

  it('rejects another tenant reference update without modifying any estimate', async () => {
    const id = await seedSources([EstimateSource.FINAL, EstimateSource.AI]);
    const before = await db
      .getRepository(Estimate)
      .find({ where: { task: { id } } });
    const other = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `${randomUUID()}@example.test`,
        password: 'test-only-password-123',
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/tasks/${id}`)
      .auth(other.body.accessToken, { type: 'bearer' })
      .send({ manualEstimate: 14 })
      .expect(403);
    expect(
      await db.getRepository(Estimate).find({ where: { task: { id } } })
    ).toEqual(before);
  });
});
