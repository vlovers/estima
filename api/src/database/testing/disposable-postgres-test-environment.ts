import { execFileSync } from 'child_process';
import { DataSource } from 'typeorm';
import { createMigrationValidationDataSource } from '../migration-validation-data-source';

export type DisposablePostgresConfig = {
  marker: string;
  containerName: string;
  host: string;
  port: number;
  username: string;
  password: string;
  adminDatabase: string;
  targetDatabase: string;
};

export const MIGRATION_TEST_MARKER = 'disposable-postgres-migration-validation';
export const MIGRATION_TEST_CONTAINER = 'ai-estimates-migration-test-db';
export const MIGRATION_TEST_HOST = '127.0.0.1';
export const MIGRATION_TEST_PORT = 55432;
export const MIGRATION_TEST_USERNAME = 'ai_estimator_migration_test';
export const MIGRATION_TEST_ADMIN_DATABASE = 'ai_estimator_migration_admin';
export const MIGRATION_TEST_DATABASE_PATTERN =
  /^ai_estimator_(migration|integration)_test_[a-z0-9_]+$/;

const fail = (message: string): never => {
  throw new Error(`Disposable PostgreSQL safety check failed: ${message}`);
};

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    fail(`${name} is required`);
  }
  return value;
};

const assertEqual = <T>(actual: T, expected: T, label: string): void => {
  if (actual !== expected) {
    fail(`${label} expected ${String(expected)}, got ${String(actual)}`);
  }
};

const assertIdentifier = (value: string, label: string): void => {
  if (!/^[a-z][a-z0-9_]*$/.test(value)) {
    fail(`${label} is not a safe PostgreSQL identifier: ${value}`);
  }

  if (value.length > 63) {
    fail(`${label} exceeds PostgreSQL identifier limit of 63 bytes: ${value}`);
  }
};

export const quoteIdentifier = (value: string): string => {
  assertIdentifier(value, 'identifier');
  return `"${value}"`;
};

export const buildDisposableDatabaseName = (prefix: string): string => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);

  return `${prefix}_${timestamp}_${process.pid}`;
};

export const readDisposablePostgresConfig = (
  defaultTargetDatabase: string
): DisposablePostgresConfig => ({
  marker: requireEnv('MIGRATION_VALIDATION_TARGET'),
  containerName:
    process.env.MIGRATION_TEST_CONTAINER ?? MIGRATION_TEST_CONTAINER,
  host: requireEnv('MIGRATION_TEST_HOST'),
  port: Number(requireEnv('MIGRATION_TEST_PORT')),
  username: requireEnv('MIGRATION_TEST_USERNAME'),
  password: requireEnv('MIGRATION_TEST_PASSWORD'),
  adminDatabase: requireEnv('MIGRATION_TEST_ADMIN_DATABASE'),
  targetDatabase: process.env.MIGRATION_TEST_DATABASE ?? defaultTargetDatabase,
});

export const assertDisposablePostgresConfig = (
  config: DisposablePostgresConfig
): void => {
  assertEqual(config.marker, MIGRATION_TEST_MARKER, 'environment marker');
  assertEqual(config.containerName, MIGRATION_TEST_CONTAINER, 'container name');
  assertEqual(config.host, MIGRATION_TEST_HOST, 'host');
  assertEqual(config.port, MIGRATION_TEST_PORT, 'port');
  assertEqual(config.username, MIGRATION_TEST_USERNAME, 'username');
  assertEqual(
    config.adminDatabase,
    MIGRATION_TEST_ADMIN_DATABASE,
    'admin database'
  );

  if (!MIGRATION_TEST_DATABASE_PATTERN.test(config.targetDatabase)) {
    fail(
      `target database must match ${MIGRATION_TEST_DATABASE_PATTERN}, got ${config.targetDatabase}`
    );
  }

  assertIdentifier(config.username, 'username');
  assertIdentifier(config.adminDatabase, 'admin database');
  assertIdentifier(config.targetDatabase, 'target database');

  if (config.targetDatabase === config.adminDatabase) {
    fail('target database must be separate from admin database');
  }

  const developmentValues = [
    process.env.POSTGRES_HOST,
    process.env.POSTGRES_PORT,
    process.env.POSTGRES_USER,
    process.env.POSTGRES_PASSWORD,
    process.env.POSTGRES_DB,
  ].filter(Boolean);

  const testValues = [
    config.host,
    String(config.port),
    config.username,
    config.password,
    config.adminDatabase,
    config.targetDatabase,
  ];

  for (const value of testValues) {
    if (developmentValues.includes(value)) {
      fail(
        `test configuration overlaps with POSTGRES_* development value: ${value}`
      );
    }
  }
};

export const assertDisposableDockerIsolation = (
  config: DisposablePostgresConfig
): void => {
  const raw = execFileSync('docker', ['inspect', config.containerName], {
    encoding: 'utf8',
  });
  const [container] = JSON.parse(raw);

  if (!container?.State?.Running) {
    fail(`Docker container ${config.containerName} is not running`);
  }

  const image = String(container.Config?.Image ?? '');
  if (!image.startsWith('postgres:')) {
    fail(`Docker container image is not postgres: ${image}`);
  }

  const ports = container.NetworkSettings?.Ports?.['5432/tcp'] ?? [];
  const hasExpectedPort = ports.some(
    (binding: { HostIp?: string; HostPort?: string }) =>
      binding.HostPort === String(config.port) && binding.HostIp === config.host
  );

  if (!hasExpectedPort) {
    fail(
      `Docker container does not publish 5432/tcp to ${config.host}:${config.port}`
    );
  }
};

export const createAdminDataSource = (
  config: DisposablePostgresConfig
): DataSource =>
  createMigrationValidationDataSource({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.adminDatabase,
  });

export const createTargetDataSource = (
  config: DisposablePostgresConfig
): DataSource =>
  createMigrationValidationDataSource({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.targetDatabase,
  });

export const initializeWithRetry = async (
  dataSource: DataSource,
  attempts = 24
): Promise<void> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await dataSource.initialize();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw lastError;
};

export const createFreshDatabase = async (
  adminDataSource: DataSource,
  config: DisposablePostgresConfig
): Promise<void> => {
  const existing = await adminDataSource.query(
    `SELECT datname FROM pg_database WHERE datname = $1`,
    [config.targetDatabase]
  );

  if (existing.length > 0) {
    fail(`target database already exists: ${config.targetDatabase}`);
  }

  await adminDataSource.query(
    `CREATE DATABASE ${quoteIdentifier(
      config.targetDatabase
    )} OWNER ${quoteIdentifier(config.username)}`
  );
};

export const verifyTargetIdentity = async (
  dataSource: DataSource,
  config: DisposablePostgresConfig
): Promise<void> => {
  const [identity] = await dataSource.query(`
    SELECT
      current_database() AS database,
      current_user AS username,
      inet_server_port() AS port
  `);

  assertEqual(identity.database, config.targetDatabase, 'current_database()');
  assertEqual(identity.username, config.username, 'current_user');
  assertEqual(Number(identity.port), 5432, 'server port inside container');
};

export const verifyNoApplicationTables = async (
  dataSource: DataSource
): Promise<void> => {
  const rows = await dataSource.query(
    `
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name = ANY($1)
    ORDER BY table_name
  `,
    [
      [
        'users',
        'projects',
        'tasks',
        'estimates',
        'estimate_feedbacks',
        'coefficients',
        'tenant_calibration_coefficients',
        'coefficient_change_events',
      ],
    ]
  );

  if (rows.length > 0) {
    fail(
      `target database already has application tables: ${rows
        .map((row: { name: string }) => row.name)
        .join(', ')}`
    );
  }
};

export const applyRuntimePostgresEnv = (
  config: DisposablePostgresConfig
): void => {
  process.env.POSTGRES_HOST = config.host;
  process.env.POSTGRES_PORT = String(config.port);
  process.env.POSTGRES_USER = config.username;
  process.env.POSTGRES_PASSWORD = config.password;
  process.env.POSTGRES_DB = config.targetDatabase;
};
