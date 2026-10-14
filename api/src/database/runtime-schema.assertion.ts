import { DataSource } from 'typeorm';

const REQUIRED_APPLICATION_TABLES = [
  'users',
  'projects',
  'tasks',
  'estimates',
  'estimate_feedbacks',
  'coefficients',
];

const REQUIRED_MIGRATIONS = [
  'BaselineCurrentSchema20261014000000',
  'SeedBaselineCoefficients20261014000001',
];

const LEGACY_MIGRATIONS = [
  'SeedCoefficients1723634255000',
  'InitialSchema1753106541815',
  'SwitchToUuidAndRefactorServices1753106611579',
  'AddStructuredFieldsToEstimates1753107000000',
  'AddStructuredFieldsToTasks1753107200000',
];

const REQUIRED_COEFFICIENT_KEYS = [
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

const missing = (expected: string[], actual: string[]): string[] => {
  const actualSet = new Set(actual);
  return expected.filter((value) => !actualSet.has(value));
};

const hasAny = (expected: string[], actual: string[]): boolean => {
  const actualSet = new Set(actual);
  return expected.some((value) => actualSet.has(value));
};

const isExactMigrationHistory = (
  expected: string[],
  actual: string[]
): boolean =>
  expected.length === actual.length &&
  expected.every((value, index) => actual[index] === value);

export const assertRuntimeDatabaseSchema = async (
  dataSource: DataSource
): Promise<void> => {
  const tableRows = await dataSource.query(`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const tableNames = tableRows.map((row: { name: string }) => row.name);
  const missingTables = missing(REQUIRED_APPLICATION_TABLES, tableNames);

  if (missingTables.length > 0) {
    throw new Error(
      `Database schema is not migrated. Missing application tables: ${missingTables.join(
        ', '
      )}. Run baseline migrations before starting the API.`
    );
  }

  if (!tableNames.includes('migrations')) {
    throw new Error(
      'Database schema is not baseline-managed. Missing TypeORM migrations history table. Existing databases must be inspected and reconciled before API startup; new installations must run the baseline migration chain.'
    );
  }

  const migrationRows = await dataSource.query(
    `SELECT name FROM "migrations" ORDER BY timestamp`
  );
  const migrationNames = migrationRows.map((row: { name: string }) => row.name);

  if (hasAny(LEGACY_MIGRATIONS, migrationNames)) {
    throw new Error(
      `Database schema is legacy-managed and cannot be used by baseline-only runtime without reconciliation. Present migration history: ${migrationNames.join(
        ', '
      )}. Back up the database, compare schema to the baseline chain, add forward-only reconciliation migrations if needed, then switch intentionally.`
    );
  }

  if (!isExactMigrationHistory(REQUIRED_MIGRATIONS, migrationNames)) {
    const missingMigrations = missing(REQUIRED_MIGRATIONS, migrationNames);
    const unexpectedMigrations = missing(migrationNames, REQUIRED_MIGRATIONS);
    throw new Error(
      `Database schema is not baseline-managed. Expected exact baseline TypeORM migration history: ${REQUIRED_MIGRATIONS.join(
        ', '
      )}. Actual history: ${
        migrationNames.join(', ') || '<empty>'
      }. Missing: ${missingMigrations.join(', ') || '<none>'}. Unexpected: ${
        unexpectedMigrations.join(', ') || '<none>'
      }. New installations must run the baseline migration chain; existing databases require migration reconciliation before API startup.`
    );
  }

  const coefficientRows = await dataSource.query(
    `SELECT "key" AS name FROM "coefficients" ORDER BY "key"`
  );
  const coefficientKeys = coefficientRows.map(
    (row: { name: string }) => row.name
  );
  const missingCoefficientKeys = missing(
    REQUIRED_COEFFICIENT_KEYS,
    coefficientKeys
  );

  if (missingCoefficientKeys.length > 0) {
    throw new Error(
      `Database seed data is incomplete. Missing baseline coefficient keys: ${missingCoefficientKeys.join(
        ', '
      )}. Do not auto-seed at startup; reconcile seed data with a forward migration.`
    );
  }

  const schemaLog = await dataSource.driver.createSchemaBuilder().log();
  if (schemaLog.upQueries.length > 0 || schemaLog.downQueries.length > 0) {
    throw new Error(
      `Database schema differs from TypeORM entity metadata. Pending SQL changes: up=${schemaLog.upQueries.length}, down=${schemaLog.downQueries.length}. Refusing to start with synchronize=false.`
    );
  }
};
