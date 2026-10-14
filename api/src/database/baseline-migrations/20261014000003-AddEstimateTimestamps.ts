import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEstimateTimestamps20261014000003
  implements MigrationInterface
{
  name = 'AddEstimateTimestamps20261014000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "estimates"
      ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
    `);
  }

  public async down(): Promise<void> {
    throw new Error(
      'AddEstimateTimestamps20261014000003 is forward-only and must not be reverted automatically.'
    );
  }
}
