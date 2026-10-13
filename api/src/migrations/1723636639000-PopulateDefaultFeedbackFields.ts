import { MigrationInterface, QueryRunner } from 'typeorm';

export class PopulateDefaultFeedbackFields1723636639000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Set default values for new non-nullable columns on existing rows
    await queryRunner.query(
      `UPDATE "estimate_feedback" SET
        "reasonForDeviation" = 'OTHER',
        "missedComplexityTags" = '[]',
        "deviationComment" = ''
      WHERE "reasonForDeviation" IS NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This is technically a destructive operation, but it's the reverse of the 'up'.
    // We'll set the fields back to NULL for the rows we might have changed.
    await queryRunner.query(
      `UPDATE "estimate_feedback" SET
        "reasonForDeviation" = NULL,
        "missedComplexityTags" = NULL,
        "deviationComment" = NULL
      WHERE "reasonForDeviation" = 'OTHER'`
    );
  }
}
