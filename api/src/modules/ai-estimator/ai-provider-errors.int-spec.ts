import { INestApplication } from '@nestjs/common';
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
});
