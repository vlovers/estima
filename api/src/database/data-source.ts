import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config();

type MigrationChain = 'legacy' | 'baseline';

const migrationChain = process.env.TYPEORM_MIGRATION_CHAIN as
  | MigrationChain
  | undefined;

const toGlobPath = (...segments: string[]): string =>
  join(...segments).replace(/\\/g, '/');

const databaseDir = __dirname;

const migrationPaths: Record<MigrationChain, string[]> = {
  legacy: [toGlobPath(databaseDir, 'migrations', '*{.ts,.js}')],
  baseline: [toGlobPath(databaseDir, 'baseline-migrations', '*{.ts,.js}')],
};

if (!migrationChain || !migrationPaths[migrationChain]) {
  throw new Error(
    `Invalid TYPEORM_MIGRATION_CHAIN "${migrationChain ?? '<unset>'}". Expected "legacy" or "baseline".`
  );
}

export const options: DataSourceOptions = {
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [toGlobPath(databaseDir, '..', 'modules', '**', '*.entity.{ts,js}')],
  migrations: migrationPaths[migrationChain],
  synchronize: false,
};

const AppDataSource = new DataSource(options);

export default AppDataSource;
