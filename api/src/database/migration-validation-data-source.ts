import 'reflect-metadata';

import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';

type MigrationValidationConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
};

const toGlobPath = (...segments: string[]): string =>
  join(...segments).replace(/\\/g, '/');

const databaseDir = __dirname;

export const createMigrationValidationDataSourceOptions = (
  config: MigrationValidationConfig
): DataSourceOptions => ({
  type: 'postgres',
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password,
  database: config.database,
  entities: [toGlobPath(databaseDir, '..', 'modules', '**', '*.entity.{ts,js}')],
  migrations: [
    toGlobPath(databaseDir, 'baseline-migrations', '*{.ts,.js}'),
  ],
  synchronize: false,
});

export const createMigrationValidationDataSource = (
  config: MigrationValidationConfig
): DataSource =>
  new DataSource(createMigrationValidationDataSourceOptions(config));
