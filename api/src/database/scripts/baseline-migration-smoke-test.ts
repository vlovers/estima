import { execFileSync } from 'child_process';
import { DataSource } from 'typeorm';
import { createMigrationValidationDataSource } from '../migration-validation-data-source';

type SmokeConfig = {
  marker: string;
  containerName: string;
  host: string;
  port: number;
  username: string;
  password: string;
  adminDatabase: string;
  targetDatabase: string;
};

const EXPECTED_MARKER = 'disposable-postgres-migration-validation';
const EXPECTED_CONTAINER = 'ai-estimates-migration-test-db';
const EXPECTED_HOST = '127.0.0.1';
const EXPECTED_PORT = 55432;
const EXPECTED_USERNAME = 'ai_estimator_migration_test';
const EXPECTED_ADMIN_DATABASE = 'ai_estimator_migration_admin';
const TARGET_DATABASE_PATTERN = /^ai_estimator_migration_test_[a-z0-9_]+$/;

const APPLICATION_TABLES = [
  'users',
  'projects',
  'tasks',
  'estimates',
  'estimate_feedbacks',
  'coefficients',
  'tenant_calibration_coefficients',
  'coefficient_change_events',
];

const EXPECTED_COEFFICIENT_KEYS = [
  'experience.JUNIOR',
  'experience.MIDDLE',
  'experience.SENIOR',
  'project.complexity.LOW',
  'project.complexity.MEDIUM',
  'project.complexity.HIGH',
  'complexity.legacy_code',
  'complexity.third_party_integration',
  'complexity.new_infra',
  'complexity.refactor',
  'complexity.concurrency',
  'complexity.data_modeling',
  'complexity.performance_critical',
];

const EXPECTED_CONSTRAINTS = [
  'PK_a3ffb1c0c8416b9fc6f907b7433',
  'PK_6271df0a7aed1d6c0691ce6ac50',
  'PK_8d12ff38fcc62aaba2cab748772',
  'PK_447af75b2f6025adf7f80703810',
  'PK_2746b9cae761b17717177b6debd',
  'PK_2104223992f94138c205755c2f0',
  'PK_tenant_calibration_coefficients',
  'PK_coefficient_change_events',
  'UQ_97672ac88f789774dd47f7c8be3',
  'UQ_bac028db857885a1d0a8cd45907',
  'CHK_tenant_calibration_coefficients_value_bounds',
  'CHK_tenant_calibration_coefficients_default_bounds',
  'CHK_tenant_calibration_coefficients_sample_count',
  'CHK_tenant_calibration_coefficients_total_weight',
  'CHK_tenant_calibration_coefficients_version',
  'FK_361a53ae58ef7034adc3c06f09f',
  'FK_e08fca67ca8966e6b9914bf2956',
  'FK_34701b0b8d466af308ba202e4ef',
  'FK_d9d30f6971adee44bd2eba9389a',
  'FK_48723ec5670bf40c50262e7bc1c',
  'FK_estimate_feedbacks_estimate',
  'FK_tenant_calibration_coefficients_tenant_user',
  'FK_coefficient_change_events_tenant_user',
  'FK_coefficient_change_events_feedback',
];

const EXPECTED_INDEXES = [
  'IDX_bac028db857885a1d0a8cd4590',
  'UQ_tenant_calibration_coefficients_tenant_key',
  'IDX_tenant_calibration_coefficients_tenant',
  'IDX_tenant_calibration_coefficients_key',
  'UQ_coefficient_change_events_feedback_key',
  'IDX_coefficient_change_events_tenant',
  'IDX_coefficient_change_events_coefficient_key',
  'IDX_coefficient_change_events_feedback',
  'IDX_estimate_feedbacks_task_idempotency_key',
  'IDX_estimate_feedbacks_estimate_id',
  'IDX_estimate_feedbacks_processing_status',
];

const EXPECTED_MIGRATIONS = [
  'BaselineCurrentSchema20261014000000',
  'SeedBaselineCoefficients20261014000001',
  'AddTenantCalibrationFoundation20261014000002',
  'AddEstimateTimestamps20261014000003',
];

const fail = (message: string): never => {
  throw new Error(`Migration validation safety check failed: ${message}`);
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

const quoteIdentifier = (value: string): string => {
  assertIdentifier(value, 'identifier');
  return `"${value}"`;
};

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const difference = (expected: string[], actual: string[]): string[] => {
  const actualSet = new Set(actual);
  return expected.filter((value) => !actualSet.has(value));
};

const readConfig = (): SmokeConfig => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  const targetDatabase =
    process.env.MIGRATION_TEST_DATABASE ??
    `ai_estimator_migration_test_${timestamp}_${process.pid}`;

  return {
    marker: requireEnv('MIGRATION_VALIDATION_TARGET'),
    containerName: process.env.MIGRATION_TEST_CONTAINER ?? EXPECTED_CONTAINER,
    host: requireEnv('MIGRATION_TEST_HOST'),
    port: Number(requireEnv('MIGRATION_TEST_PORT')),
    username: requireEnv('MIGRATION_TEST_USERNAME'),
    password: requireEnv('MIGRATION_TEST_PASSWORD'),
    adminDatabase: requireEnv('MIGRATION_TEST_ADMIN_DATABASE'),
    targetDatabase,
  };
};

const assertFailClosedConfig = (config: SmokeConfig): void => {
  assertEqual(config.marker, EXPECTED_MARKER, 'environment marker');
  assertEqual(config.containerName, EXPECTED_CONTAINER, 'container name');
  assertEqual(config.host, EXPECTED_HOST, 'host');
  assertEqual(config.port, EXPECTED_PORT, 'port');
  assertEqual(config.username, EXPECTED_USERNAME, 'username');
  assertEqual(config.adminDatabase, EXPECTED_ADMIN_DATABASE, 'admin database');

  if (!TARGET_DATABASE_PATTERN.test(config.targetDatabase)) {
    fail(
      `target database must match ${TARGET_DATABASE_PATTERN}, got ${config.targetDatabase}`
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

const assertDockerIsolation = (config: SmokeConfig): void => {
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

const createAdminDataSource = (config: SmokeConfig): DataSource =>
  createMigrationValidationDataSource({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.adminDatabase,
  });

const createTargetDataSource = (config: SmokeConfig): DataSource =>
  createMigrationValidationDataSource({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.targetDatabase,
  });

const initializeWithRetry = async (
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

const queryNames = async (
  dataSource: DataSource,
  sql: string,
  parameters: unknown[]
): Promise<string[]> => {
  const rows = await dataSource.query(sql, parameters);
  return rows.map((row: { name: string }) => row.name).sort();
};

const assertInitialTargetIsEmpty = async (
  dataSource: DataSource
): Promise<void> => {
  const existingTables = await queryNames(
    dataSource,
    `
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1)
      ORDER BY table_name
    `,
    [APPLICATION_TABLES]
  );

  if (existingTables.length > 0) {
    fail(
      `target database already has application tables: ${existingTables.join(
        ', '
      )}`
    );
  }
};

const createFreshTargetDatabase = async (
  adminDataSource: DataSource,
  config: SmokeConfig
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

const verifyDatabaseIdentity = async (
  dataSource: DataSource,
  config: SmokeConfig
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

const verifyTables = async (dataSource: DataSource): Promise<void> => {
  const tables = await queryNames(
    dataSource,
    `
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `,
    []
  );

  const missing = difference(APPLICATION_TABLES, tables);
  if (missing.length > 0) {
    fail(`missing application tables: ${missing.join(', ')}`);
  }
};

const verifyConstraintsAndIndexes = async (
  dataSource: DataSource
): Promise<void> => {
  const constraints = await queryNames(
    dataSource,
    `
      SELECT conname AS name
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
      ORDER BY conname
    `,
    []
  );
  const missingConstraints = difference(EXPECTED_CONSTRAINTS, constraints);

  if (missingConstraints.length > 0) {
    fail(`missing constraints: ${missingConstraints.join(', ')}`);
  }

  const indexes = await queryNames(
    dataSource,
    `
      SELECT indexname AS name
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY indexname
    `,
    []
  );
  const missingIndexes = difference(EXPECTED_INDEXES, indexes);

  if (missingIndexes.length > 0) {
    fail(`missing indexes: ${missingIndexes.join(', ')}`);
  }
};

const verifyCoefficientKeys = async (dataSource: DataSource): Promise<void> => {
  const keys = await queryNames(
    dataSource,
    `SELECT "key" AS name FROM "coefficients" ORDER BY "key"`,
    []
  );

  const missing = difference(EXPECTED_COEFFICIENT_KEYS, keys);
  const unexpected = difference(keys, EXPECTED_COEFFICIENT_KEYS);

  if (keys.length !== 13 || missing.length > 0 || unexpected.length > 0) {
    fail(
      `coefficient keys mismatch; missing=${
        missing.join(', ') || '<none>'
      }; unexpected=${unexpected.join(', ') || '<none>'}`
    );
  }
};

const verifyMigrationHistory = async (
  dataSource: DataSource
): Promise<void> => {
  const migrationNames = await queryNames(
    dataSource,
    `SELECT name FROM "migrations" ORDER BY timestamp`,
    []
  );

  if (
    migrationNames.length !== EXPECTED_MIGRATIONS.length ||
    unique(migrationNames).length !== migrationNames.length
  ) {
    fail(`unexpected migration history: ${migrationNames.join(', ')}`);
  }

  const missing = difference(EXPECTED_MIGRATIONS, migrationNames);
  if (missing.length > 0) {
    fail(`missing migration history rows: ${missing.join(', ')}`);
  }
};

const verifyNoSchemaDiff = async (dataSource: DataSource): Promise<void> => {
  const schemaLog = await dataSource.driver.createSchemaBuilder().log();
  const upQueries = schemaLog.upQueries.map((query) => query.query);
  const downQueries = schemaLog.downQueries.map((query) => query.query);

  if (upQueries.length > 0 || downQueries.length > 0) {
    fail(
      `entity metadata schema diff is not empty; up=${upQueries.length}, down=${
        downQueries.length
      }\n${upQueries.join('\n')}`
    );
  }
};

const main = async (): Promise<void> => {
  const config = readConfig();
  assertFailClosedConfig(config);
  assertDockerIsolation(config);
  console.log('PASS safety: dedicated disposable Docker target verified');

  const adminDataSource = createAdminDataSource(config);
  await initializeWithRetry(adminDataSource);

  try {
    await createFreshTargetDatabase(adminDataSource, config);
    console.log(
      `PASS setup: created fresh target database ${config.targetDatabase}`
    );
  } finally {
    await adminDataSource.destroy();
  }

  const targetDataSource = createTargetDataSource(config);
  await initializeWithRetry(targetDataSource);

  try {
    await verifyDatabaseIdentity(targetDataSource, config);
    console.log('PASS identity: target database and user verified');

    await assertInitialTargetIsEmpty(targetDataSource);
    console.log('PASS preflight: target database has no application tables');

    const migrations = await targetDataSource.runMigrations({
      transaction: 'all',
    });
    assertEqual(migrations.length, 4, 'baseline migration count');
    console.log(
      `PASS migrations: applied ${migrations
        .map((migration) => migration.name)
        .join(', ')}`
    );

    await verifyTables(targetDataSource);
    console.log('PASS schema: all eight application tables exist');

    await verifyConstraintsAndIndexes(targetDataSource);
    console.log('PASS schema: expected constraints and indexes exist');

    await verifyCoefficientKeys(targetDataSource);
    console.log('PASS data: all 13 baseline coefficient keys exist');

    await verifyMigrationHistory(targetDataSource);
    console.log('PASS history: TypeORM migration history verified');

    const secondRun = await targetDataSource.runMigrations({
      transaction: 'all',
    });
    assertEqual(secondRun.length, 0, 'second migration run count');
    console.log(
      'PASS idempotence: second migration run had no pending migrations'
    );

    await verifyNoSchemaDiff(targetDataSource);
    console.log('PASS metadata: TypeORM entity metadata has no schema diff');
  } finally {
    await targetDataSource.destroy();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
