import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedCoefficients1723634255000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const coefficients = [
      // Experience Level
      { key: 'experience_junior', value: 1.5, category: 'experience', description: 'Multiplier for junior-level tasks.' },
      { key: 'experience_middle', value: 1.0, category: 'experience', description: 'Baseline for middle-level tasks.' },
      { key: 'experience_senior', value: 0.75, category: 'experience', description: 'Multiplier for senior-level tasks.' },
      // Project Complexity
      { key: 'project_complexity_low', value: 0.9, category: 'project', description: 'Multiplier for low-complexity projects.' },
      { key: 'project_complexity_medium', value: 1.0, category: 'project', description: 'Baseline for medium-complexity projects.' },
      { key: 'project_complexity_high', value: 1.2, category: 'project', description: 'Multiplier for high-complexity projects.' },
      // Complexity Tags
      { key: 'complexity_legacy_code', value: 1.2, category: 'tag', description: 'Working with legacy code.' },
      { key: 'complexity_third_party_integration', value: 1.15, category: 'tag', description: 'Integrating with third-party APIs.' },
      { key: 'complexity_new_infra', value: 1.12, category: 'tag', description: 'Setting up new infrastructure.' },
      { key: 'complexity_refactor', value: 1.08, category: 'tag', description: 'Significant refactoring of existing code.' },
      // UI/UX Complexity
      { key: 'ui_complexity_low', value: 1.0, category: 'ui', description: 'Low UI complexity.' },
      { key: 'ui_complexity_medium', value: 1.1, category: 'ui', description: 'Medium UI complexity.' },
      { key: 'ui_complexity_high', value: 1.2, category: 'ui', description: 'High UI complexity.' },
      // Data Migration
      { key: 'migration_low', value: 1.05, category: 'migration', description: 'Low complexity data migration.' },
      { key: 'migration_medium', value: 1.1, category: 'migration', description: 'Medium complexity data migration.' },
      { key: 'migration_high', value: 1.2, category: 'migration', description: 'High complexity data migration.' },
      // Global Factors
      { key: 'global_uncertainty_factor', value: 0.3, category: 'global', description: 'Default uncertainty for p10/p90 calculation (30%).' },
    ];

    for (const c of coefficients) {
      await queryRunner.query(
        `INSERT INTO "coefficients" ("key", "value", "category", "description") VALUES ($1, $2, $3, $4) ON CONFLICT ("key") DO NOTHING`,
        [c.key, c.value, c.category, c.description]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "coefficients"`);
  }
}
