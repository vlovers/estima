import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStructuredFieldsToTasks1753107200000
  implements MigrationInterface
{
  name = 'AddStructuredFieldsToTasks1753107200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "acceptanceCriteria" jsonb DEFAULT '[]'`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assumptions" jsonb DEFAULT '[]'`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "constraints" jsonb DEFAULT '[]'`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "nfrs" jsonb DEFAULT '[]'`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "integrations" jsonb DEFAULT '[]'`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "testing" jsonb`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "documentation" jsonb`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "complexityTags" jsonb DEFAULT '[]'`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "uiDesignComplexity" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "needsDataMigration" boolean DEFAULT false`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "migrationComplexity" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "migrationComplexity"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "needsDataMigration"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "uiDesignComplexity"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "complexityTags"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "documentation"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "testing"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "integrations"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "nfrs"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "constraints"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "assumptions"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN IF EXISTS "acceptanceCriteria"`
    );
  }
}
