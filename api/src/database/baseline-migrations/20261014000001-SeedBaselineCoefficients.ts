import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedBaselineCoefficients20261014000001
  implements MigrationInterface
{
  name = 'SeedBaselineCoefficients20261014000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const coefficients = [
      {
        key: 'experience.JUNIOR',
        value: 1.5,
        category: 'experience',
        description: 'Modifier for Junior-level tasks.',
      },
      {
        key: 'experience.MIDDLE',
        value: 1.0,
        category: 'experience',
        description: 'Baseline modifier for Middle-level tasks.',
      },
      {
        key: 'experience.SENIOR',
        value: 0.75,
        category: 'experience',
        description: 'Modifier for Senior-level tasks.',
      },
      {
        key: 'project.complexity.LOW',
        value: 0.9,
        category: 'project',
        description: 'Modifier for low-complexity projects.',
      },
      {
        key: 'project.complexity.MEDIUM',
        value: 1.0,
        category: 'project',
        description: 'Baseline modifier for medium-complexity projects.',
      },
      {
        key: 'project.complexity.HIGH',
        value: 1.2,
        category: 'project',
        description: 'Modifier for high-complexity projects.',
      },
      {
        key: 'complexity.legacy_code',
        value: 1.4,
        category: 'complexity',
        description: 'Working with old, poorly documented code.',
      },
      {
        key: 'complexity.third_party_integration',
        value: 1.3,
        category: 'complexity',
        description: 'Integrating with external APIs or services.',
      },
      {
        key: 'complexity.new_infra',
        value: 1.5,
        category: 'complexity',
        description: 'Setting up new infrastructure components.',
      },
      {
        key: 'complexity.refactor',
        value: 1.2,
        category: 'complexity',
        description: 'Significant refactoring of existing code.',
      },
      {
        key: 'complexity.concurrency',
        value: 1.6,
        category: 'complexity',
        description: 'Tasks involving multithreading or parallel processing.',
      },
      {
        key: 'complexity.data_modeling',
        value: 1.3,
        category: 'complexity',
        description: 'Complex data schema design or modification.',
      },
      {
        key: 'complexity.performance_critical',
        value: 1.4,
        category: 'complexity',
        description: 'Tasks with strict performance requirements.',
      },
    ];

    for (const coefficient of coefficients) {
      await queryRunner.query(
        `INSERT INTO "coefficients" ("key", "value", "category", "description")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("key") DO NOTHING`,
        [
          coefficient.key,
          coefficient.value,
          coefficient.category,
          coefficient.description,
        ]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "coefficients"
       WHERE "key" IN (
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
         'complexity.performance_critical'
       )`
    );
  }
}
