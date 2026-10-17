/* Real Docker/Nest/PostgreSQL smoke. Only the external AI provider is simulated. */
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { execFileSync } = require('node:child_process');
const { writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { chromium, expect } = require('@playwright/test');

async function main() {
  require('ts-node').register({
    project: 'api/tsconfig.app.json',
    transpileOnly: true,
  });
  const safety = require('../../api/src/database/testing/disposable-postgres-test-environment');
  Object.assign(process.env, {
    MIGRATION_VALIDATION_TARGET: 'disposable-postgres-migration-validation',
    MIGRATION_TEST_HOST: '127.0.0.1',
    MIGRATION_TEST_PORT: '55432',
    MIGRATION_TEST_USERNAME: 'ai_estimator_migration_test',
    MIGRATION_TEST_PASSWORD: 'ai_estimator_migration_test_password',
    MIGRATION_TEST_ADMIN_DATABASE: 'ai_estimator_migration_admin',
  });
  // Never reuse an externally selected test database: this smoke owns a fresh name.
  delete process.env.MIGRATION_TEST_DATABASE;
  const config = safety.readDisposablePostgresConfig(
    safety.buildDisposableDatabaseName('ai_estimator_integration_test_browser')
  );
  safety.assertDisposablePostgresConfig(config);
  safety.assertDisposableDockerIsolation(config);
  const admin = safety.createAdminDataSource(config);
  await safety.initializeWithRetry(admin);
  try {
    await safety.createFreshDatabase(admin, config);
  } finally {
    await admin.destroy();
  }
  const db = safety.createTargetDataSource(config);
  await safety.initializeWithRetry(db);
  try {
    await safety.verifyTargetIdentity(db, config);
    await safety.verifyNoApplicationTables(db);
    await db.runMigrations({ transaction: 'all' });
  } finally {
    await db.destroy();
  }

  let mode = 'success',
    providerCalls = 0;
  const provider = createServer(async (req, res) => {
    providerCalls++;
    let raw = '';
    for await (const part of req) raw += part;
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'quota') {
      res.writeHead(429);
      res.end(
        JSON.stringify({
          error: {
            message: 'fixture-sensitive-upstream-detail',
            type: 'insufficient_quota',
            code: 'insufficient_quota',
          },
        })
      );
      return;
    }
    const body = JSON.parse(raw);
    const schema = body.response_format?.json_schema?.name;
    const content =
      schema === 'SpecQuality'
        ? JSON.stringify({ score: 0.95, reasons: [], missing: [] })
        : schema === 'ai_estimate_response'
        ? JSON.stringify({
            subtasks: [
              {
                title: 'Build form',
                description: 'Implement accessible controls',
                estimateHours: 4,
                explanation: 'Deterministic provider fixture',
              },
              {
                title: 'Test form',
                description: 'Test input validation',
                estimateHours: 2,
                explanation: 'Deterministic provider fixture',
              },
            ],
            risks: [],
            managerNote: null,
            questions: null,
          })
        : '6';
    res.end(
      JSON.stringify({
        id: 'local-fixture',
        object: 'chat.completion',
        created: 0,
        model: 'local-fixture',
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
  await new Promise((resolve) => provider.listen(4319, '0.0.0.0', resolve));
  const root = '/private/tmp/estima-real-smoke';
  mkdirSync(root, { recursive: true });
  const envFile = `${root}/api.env`;
  writeFileSync(
    envFile,
    [
      'POSTGRES_HOST=ai-estimates-migration-test-db',
      'POSTGRES_PORT=5432',
      `POSTGRES_DB=${config.targetDatabase}`,
      `POSTGRES_USER=${config.username}`,
      `POSTGRES_PASSWORD=${config.password}`,
      'OPENAI_API_KEY=test-only-no-live-provider-access',
      'OPENAI_BASE_URL=http://host.docker.internal:4319/v1',
      `JWT_ACCESS_SECRET=${randomUUID()}${randomUUID()}`,
      `JWT_REFRESH_SECRET=${randomUUID()}${randomUUID()}`,
      'CORS_ORIGINS=http://localhost,http://localhost:4200',
      'PORT=3000',
    ].join('\n'),
    { mode: 0o600 }
  );
  const container = `estima-real-smoke-${process.pid}`;
  let browser,
    page,
    started = false;
  const steps = [];
  let stage = 'start isolated API';
  try {
    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--rm',
        '--name',
        container,
        '--network',
        'ai-estimates-monorepo_app-network',
        '--env-file',
        envFile,
        '-p',
        '127.0.0.1:3301:3000',
        'estima-api:real-integration',
      ],
      { stdio: 'pipe' }
    );
    started = true;
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch('http://localhost:3301/api/projects');
        if (response.status === 401) break;
      } catch {}
      if (attempt >= 40) throw new Error('Isolated API did not become ready');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    for (const origin of ['http://localhost', 'http://localhost:4200']) {
      const response = await fetch('http://localhost:3301/api/tasks', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,authorization',
        },
      });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal(
        response.headers.get('access-control-allow-credentials'),
        'true'
      );
    }
    steps.push('credentialed CORS preflight for localhost and localhost:4200');
    const chrome =
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    browser = await chromium.launch(
      existsSync(chrome) ? { executablePath: chrome } : {}
    );
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path.startsWith('/api/'))
        console.log(`HTTP ${response.status()} ${path}`);
    });
    let refreshCount = 0;
    // The app fixes its API origin at :3000. Forward requests to our disposable
    // Docker API; no API response bodies or status codes are mocked or rewritten.
    await page.route('http://localhost:3000/api/**', async (route) => {
      if (route.request().url().endsWith('/auth/refresh')) refreshCount++;
      const response = await route.fetch({
        url: route.request().url().replace('localhost:3000', 'localhost:3301'),
      });
      await route.fulfill({ response });
    });
    const email = `smoke-${randomUUID()}@example.test`,
      password = `Test-${randomUUID()}`;
    stage = 'registration';
    await page.goto('http://localhost/register');
    stage = 'registration form';
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    stage = 'registration result';
    await page
      .getByRole('heading', { name: 'Start with your first project' })
      .waitFor();
    const cookies = await context.cookies();
    assert(
      cookies.some(
        (cookie) => cookie.name === 'refreshToken' && cookie.httpOnly
      )
    );
    assert(
      !(await page.evaluate(() => document.cookie)).includes('refreshToken')
    );
    steps.push('registration and HttpOnly cookie');
    stage = 'logout and login';
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel(/^Password/).fill('wrong-test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('alert').first().waitFor();
    await page.getByLabel(/^Password/).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Start with your first project' })
      .waitFor();
    steps.push('logout, failed login and successful login');
    stage = 'cookie refresh';
    await page.evaluate(() =>
      localStorage.setItem('token', 'invalid-test-access-token')
    );
    const beforeRefresh = refreshCount;
    await page.reload();
    await page
      .getByRole('heading', { name: 'Start with your first project' })
      .waitFor();
    assert(refreshCount > beforeRefresh);
    assert(await page.evaluate(() => !!localStorage.getItem('token')));
    steps.push(
      'real cookie refresh after a resource rejects an invalid access token'
    );
    stage = 'project CRUD';
    await page
      .getByRole('main')
      .getByRole('link', { name: 'New project', exact: true })
      .first()
      .click();
    await page.getByLabel('Project name').fill('Disposable real smoke');
    await page
      .getByLabel(/^Description/)
      .fill(
        'Disposable verification records in an isolated PostgreSQL database.'
      );
    await page
      .getByRole('button', { name: 'Create project', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Actions for Disposable real smoke' })
      .click();
    await page
      .getByRole('menuitem', { name: 'Edit project', exact: true })
      .click();
    await page.getByLabel('Project name').fill('Disposable verified workspace');
    await page
      .getByRole('button', { name: 'Save project', exact: true })
      .click();
    await page
      .getByRole('link', { name: 'Disposable verified workspace', exact: true })
      .click();
    await page
      .getByRole('heading', {
        name: 'Disposable verified workspace',
        exact: true,
      })
      .waitFor();
    steps.push('project creation and editing');
    const createTask = async (title, ai) => {
      await page.getByRole('button', { name: 'Add task', exact: true }).click();
      const dialog = page.getByRole('dialog', {
        name: 'New task',
        exact: true,
      });
      await dialog.getByLabel('Task title').fill(title);
      await dialog
        .getByLabel(/^Description/)
        .fill(
          'Implement a bounded accessible React form and verify its validation with unit tests.'
        );
      await dialog.getByLabel(/^Technology/).fill('React');
      if (!ai)
        await dialog.getByText('Use AI estimate', { exact: true }).click();
      await dialog.getByLabel(/^Manual estimate/).fill('8');
      await dialog
        .getByRole('button', { name: 'Create task', exact: true })
        .click();
    };
    stage = 'manual-only task while provider quota is exhausted';
    mode = 'quota';
    providerCalls = 0;
    await createTask('Manual smoke task', false);
    await page
      .getByRole('heading', { name: 'Manual smoke task', exact: true })
      .waitFor();
    assert.equal(providerCalls, 0);
    let card = page.getByRole('article').filter({
      has: page.getByRole('heading', {
        name: 'Manual smoke task',
        exact: true,
      }),
    });
    assert((await card.innerText()).includes('8'));
    await card
      .getByRole('button', { name: 'Manual estimate', exact: true })
      .click();
    const manualDialog = page.getByRole('dialog', {
      name: 'Set a manual estimate',
      exact: true,
    });
    const manualInput = manualDialog.getByLabel('Manual Estimate (hours)');
    await manualInput.fill('');
    await manualInput.pressSequentially('14', { delay: 80 });
    await expect(manualInput).toHaveValue('14');
    await page
      .getByRole('button', { name: 'Set Estimate', exact: true })
      .click();
    await manualDialog.waitFor({ state: 'hidden' });
    await expect(card).toContainText('14');
    await card
      .getByRole('button', { name: 'Actions for Manual smoke task' })
      .click();
    await page
      .getByRole('menuitem', { name: 'Edit task', exact: true })
      .click();
    await page.getByLabel('Task title').fill('Edited manual smoke task');
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Edited manual smoke task', exact: true })
      .waitFor();
    steps.push(
      'manual-only task creation, manual estimate update and task editing'
    );
    stage = 'AI quota error UI';
    await createTask('Quota failure smoke task', true);
    await page
      .getByRole('dialog', { name: 'New task', exact: true })
      .getByRole('alert')
      .filter({ hasText: 'provider quota is exhausted' })
      .waitFor();
    assert.equal(
      await page.getByLabel('Task title').inputValue(),
      'Quota failure smoke task'
    );
    await page.screenshot({ path: `${root}/quota-error.png` });
    await page.keyboard.press('Escape');
    steps.push('sanitized quota error and form input preservation');
    stage = 'deterministic AI persistence';
    mode = 'success';
    await createTask('AI persistence smoke task', true);
    await page
      .getByRole('heading', { name: 'AI persistence smoke task', exact: true })
      .waitFor();
    const projectId = page.url().split('/').pop();
    await page.reload();
    await page
      .getByRole('heading', { name: 'AI persistence smoke task', exact: true })
      .waitFor();
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const loaded = await fetch(
      `http://localhost:3301/api/projects/${projectId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    assert.equal(loaded.status, 200);
    const project = await loaded.json();
    const aiTask = project.tasks.find(
      (task) => task.title === 'AI persistence smoke task'
    );
    assert(
      aiTask.estimates.some(
        (estimate) => estimate.source === 'final' && estimate.finalEstimate > 0
      )
    );
    assert(
      !project.tasks.some((task) => task.title === 'Quota failure smoke task')
    );
    await page.screenshot({
      path: `${root}/persisted-estimates.png`,
      fullPage: true,
    });
    steps.push(
      'AI SDK fixture estimate persisted and returned after browser reload'
    );
    stage = 'task deletion';
    card = page.getByRole('article').filter({
      has: page.getByRole('heading', {
        name: 'Edited manual smoke task',
        exact: true,
      }),
    });
    await card
      .getByRole('button', { name: 'Actions for Edited manual smoke task' })
      .click();
    await page
      .getByRole('menuitem', { name: 'Delete task', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Delete task', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Edited manual smoke task', exact: true })
      .waitFor({ state: 'hidden' });
    steps.push('task deletion');
    stage = 'project deletion';
    await page.getByRole('link', { name: 'All projects', exact: true }).click();
    await page
      .getByRole('button', {
        name: 'Actions for Disposable verified workspace',
      })
      .click();
    await page
      .getByRole('menuitem', { name: 'Delete project', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Delete project', exact: true })
      .click();
    await page
      .getByRole('heading', { name: 'Start with your first project' })
      .waitFor();
    steps.push('project deletion');
    stage = 'final logout';
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('heading', { name: 'Welcome back' }).waitFor();
    const refresh = await context.request.post(
      'http://localhost:3301/api/auth/refresh'
    );
    assert([401, 403].includes(refresh.status()));
    steps.push('logout clears refresh cookie; refresh is rejected');
    console.log(
      JSON.stringify(
        {
          result: 'PASS',
          database: config.targetDatabase,
          provider: 'local deterministic HTTP stub; no live AI calls',
          steps,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      `Real workspace smoke failed at: ${stage}; ${error.name}; ${
        error.message.split('\n')[0]
      }`
    );
    if (page)
      await page.screenshot({ path: `${root}/failure.png` }).catch(() => {});
    throw error;
  } finally {
    if (browser) await browser.close();
    if (started) execFileSync('docker', ['stop', container], { stdio: 'pipe' });
    await new Promise((resolve) => provider.close(resolve));
  }
}
main().catch(() => {
  process.exitCode = 1;
});
