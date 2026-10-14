import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselineCurrentSchema20261014000000
  implements MigrationInterface
{
  name = 'BaselineCurrentSchema20261014000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `CREATE TYPE "projects_complexity_enum" AS ENUM ('LOW', 'MEDIUM', 'HIGH')`
    );
    await queryRunner.query(
      `CREATE TYPE "tasks_experiencelevel_enum" AS ENUM ('JUNIOR', 'MIDDLE', 'SENIOR')`
    );
    await queryRunner.query(
      `CREATE TYPE "tasks_status_enum" AS ENUM ('pending_clarification', 'estimated')`
    );
    await queryRunner.query(
      `CREATE TYPE "estimates_source_enum" AS ENUM ('ai_subtask_sum', 'manual', 'final', 'ai')`
    );
    await queryRunner.query(
      `CREATE TYPE "estimate_feedbacks_reasonfordeviation_enum" AS ENUM ('UNFORESEEN_TECHNICAL_COMPLEXITY', 'SCOPE_CREEP', 'INCORRECT_INITIAL_ASSUMPTIONS', 'ENVIRONMENT_OR_TOOLING_ISSUES', 'EXTERNAL_DEPENDENCY_DELAY', 'ESTIMATE_WAS_ACCURATE', 'OTHER')`
    );

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "password" character varying NOT NULL,
        "refreshToken" character varying,
        CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "description" text,
        "complexity" "projects_complexity_enum" NOT NULL DEFAULT 'MEDIUM',
        "overhead" double precision NOT NULL DEFAULT 0,
        "userId" uuid,
        CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying NOT NULL,
        "description" character varying,
        "technology" character varying,
        "experienceLevel" "tasks_experiencelevel_enum",
        "tags" text,
        "acceptanceCriteria" jsonb DEFAULT '[]',
        "assumptions" jsonb DEFAULT '[]',
        "constraints" jsonb DEFAULT '[]',
        "nfrs" jsonb DEFAULT '[]',
        "integrations" jsonb DEFAULT '[]',
        "testing" jsonb,
        "documentation" jsonb,
        "complexityTags" jsonb DEFAULT '[]',
        "uiDesignComplexity" character varying,
        "needsDataMigration" boolean NOT NULL DEFAULT false,
        "migrationComplexity" character varying,
        "riskAnalysis" jsonb DEFAULT '[]',
        "breakdown" boolean NOT NULL DEFAULT true,
        "status" "tasks_status_enum" NOT NULL DEFAULT 'estimated',
        "clarificationHistory" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "projectId" uuid,
        "parentTaskId" uuid,
        CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "estimates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "finalEstimate" double precision NOT NULL DEFAULT 0,
        "manualEstimate" double precision,
        "confidence" double precision,
        "explanation" text,
        "managerExplanation" text,
        "p10" double precision,
        "p50" double precision,
        "p90" double precision,
        "topDown" double precision,
        "bottomUp" double precision,
        "divergencePct" double precision,
        "logs" text,
        "source" "estimates_source_enum" NOT NULL,
        "taskId" uuid,
        CONSTRAINT "PK_447af75b2f6025adf7f80703810" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "estimate_feedbacks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "taskId" uuid NOT NULL,
        "actualHours" double precision NOT NULL,
        "userEstimate" double precision,
        "rating" integer,
        "comment" text,
        "reasonForDeviation" "estimate_feedbacks_reasonfordeviation_enum",
        "missedComplexityTags" text,
        "deviationComment" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_2746b9cae761b17717177b6debd" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `COMMENT ON COLUMN "estimate_feedbacks"."missedComplexityTags" IS 'Complexity tags that were missed during initial estimation.'`
    );

    await queryRunner.query(`
      CREATE TABLE "coefficients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "key" character varying(255) NOT NULL,
        "value" double precision NOT NULL,
        "description" text,
        "category" character varying(50),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_bac028db857885a1d0a8cd45907" UNIQUE ("key"),
        CONSTRAINT "PK_2104223992f94138c205755c2f0" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_bac028db857885a1d0a8cd4590" ON "coefficients" ("key")`
    );

    await queryRunner.query(`
      ALTER TABLE "projects"
      ADD CONSTRAINT "FK_361a53ae58ef7034adc3c06f09f"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "tasks"
      ADD CONSTRAINT "FK_e08fca67ca8966e6b9914bf2956"
      FOREIGN KEY ("projectId") REFERENCES "projects"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "tasks"
      ADD CONSTRAINT "FK_34701b0b8d466af308ba202e4ef"
      FOREIGN KEY ("parentTaskId") REFERENCES "tasks"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "estimates"
      ADD CONSTRAINT "FK_d9d30f6971adee44bd2eba9389a"
      FOREIGN KEY ("taskId") REFERENCES "tasks"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "estimate_feedbacks"
      ADD CONSTRAINT "FK_48723ec5670bf40c50262e7bc1c"
      FOREIGN KEY ("taskId") REFERENCES "tasks"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "estimate_feedbacks" DROP CONSTRAINT "FK_48723ec5670bf40c50262e7bc1c"`
    );
    await queryRunner.query(
      `ALTER TABLE "estimates" DROP CONSTRAINT "FK_d9d30f6971adee44bd2eba9389a"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_34701b0b8d466af308ba202e4ef"`
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP CONSTRAINT "FK_e08fca67ca8966e6b9914bf2956"`
    );
    await queryRunner.query(
      `ALTER TABLE "projects" DROP CONSTRAINT "FK_361a53ae58ef7034adc3c06f09f"`
    );

    await queryRunner.query(`DROP INDEX "IDX_bac028db857885a1d0a8cd4590"`);
    await queryRunner.query(`DROP TABLE "coefficients"`);
    await queryRunner.query(`DROP TABLE "estimate_feedbacks"`);
    await queryRunner.query(`DROP TABLE "estimates"`);
    await queryRunner.query(`DROP TABLE "tasks"`);
    await queryRunner.query(`DROP TABLE "projects"`);
    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(
      `DROP TYPE "estimate_feedbacks_reasonfordeviation_enum"`
    );
    await queryRunner.query(`DROP TYPE "estimates_source_enum"`);
    await queryRunner.query(`DROP TYPE "tasks_status_enum"`);
    await queryRunner.query(`DROP TYPE "tasks_experiencelevel_enum"`);
    await queryRunner.query(`DROP TYPE "projects_complexity_enum"`);
  }
}
