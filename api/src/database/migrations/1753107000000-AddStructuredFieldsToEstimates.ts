import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStructuredFieldsToEstimates1753107000000
  implements MigrationInterface
{
  name = 'AddStructuredFieldsToEstimates1753107000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "p10" double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "p50" double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "p90" double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "topDown" double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "bottomUp" double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "divergencePct" double precision`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" ADD COLUMN IF NOT EXISTS "logs" text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP COLUMN IF EXISTS "logs"`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP COLUMN IF EXISTS "divergencePct"`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP COLUMN IF EXISTS "bottomUp"`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP COLUMN IF EXISTS "topDown"`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP COLUMN IF EXISTS "p90"`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP COLUMN IF EXISTS "p50"`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP COLUMN IF EXISTS "p10"`
    );
  }
}
