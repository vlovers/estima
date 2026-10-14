import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantCalibrationFoundation20261014000002
  implements MigrationInterface
{
  name = 'AddTenantCalibrationFoundation20261014000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "estimate_feedbacks_processingstatus_enum" AS ENUM ('pending', 'processed', 'skipped', 'failed')`
    );

    await queryRunner.query(`
      ALTER TABLE "estimate_feedbacks"
      ADD "estimateId" uuid,
      ADD "idempotencyKey" character varying(128),
      ADD "estimatedHoursSnapshot" double precision,
      ADD "processingStatus" "estimate_feedbacks_processingstatus_enum" NOT NULL DEFAULT 'pending',
      ADD "processedAt" TIMESTAMP,
      ADD "processingError" text,
      ADD "algorithmVersion" character varying(32)
    `);

    await queryRunner.query(`
      CREATE TABLE "tenant_calibration_coefficients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantUserId" uuid NOT NULL,
        "key" character varying(255) NOT NULL,
        "value" double precision NOT NULL,
        "defaultValue" double precision NOT NULL,
        "minValue" double precision NOT NULL,
        "maxValue" double precision NOT NULL,
        "eligibleSampleCount" integer NOT NULL DEFAULT 0,
        "totalWeight" double precision NOT NULL DEFAULT 0,
        "ewmaLogError" double precision NOT NULL DEFAULT 0,
        "lastFeedbackId" uuid,
        "version" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_tenant_calibration_coefficients_value_bounds" CHECK ("value" >= "minValue" AND "value" <= "maxValue"),
        CONSTRAINT "CHK_tenant_calibration_coefficients_default_bounds" CHECK ("defaultValue" >= "minValue" AND "defaultValue" <= "maxValue"),
        CONSTRAINT "CHK_tenant_calibration_coefficients_sample_count" CHECK ("eligibleSampleCount" >= 0),
        CONSTRAINT "CHK_tenant_calibration_coefficients_total_weight" CHECK ("totalWeight" >= 0),
        CONSTRAINT "CHK_tenant_calibration_coefficients_version" CHECK ("version" >= 1),
        CONSTRAINT "PK_tenant_calibration_coefficients" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "coefficient_change_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenantUserId" uuid NOT NULL,
        "feedbackId" uuid NOT NULL,
        "coefficientKey" character varying(255) NOT NULL,
        "oldValue" double precision NOT NULL,
        "newValue" double precision NOT NULL,
        "defaultValue" double precision,
        "correctionFactor" double precision,
        "clampedCorrectionFactor" double precision,
        "sampleCountBefore" integer,
        "sampleCountAfter" integer,
        "weight" double precision,
        "reason" character varying(100),
        "algorithmVersion" character varying(32) NOT NULL,
        "changeMetadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coefficient_change_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_tenant_calibration_coefficients_tenant_key" ON "tenant_calibration_coefficients" ("tenantUserId", "key")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_calibration_coefficients_tenant" ON "tenant_calibration_coefficients" ("tenantUserId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_tenant_calibration_coefficients_key" ON "tenant_calibration_coefficients" ("key")`
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_coefficient_change_events_feedback_key" ON "coefficient_change_events" ("feedbackId", "coefficientKey")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_coefficient_change_events_tenant" ON "coefficient_change_events" ("tenantUserId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_coefficient_change_events_coefficient_key" ON "coefficient_change_events" ("coefficientKey")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_coefficient_change_events_feedback" ON "coefficient_change_events" ("feedbackId")`
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_estimate_feedbacks_task_idempotency_key" ON "estimate_feedbacks" ("taskId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_estimate_feedbacks_estimate_id" ON "estimate_feedbacks" ("estimateId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_estimate_feedbacks_processing_status" ON "estimate_feedbacks" ("processingStatus")`
    );

    await queryRunner.query(`
      ALTER TABLE "tenant_calibration_coefficients"
      ADD CONSTRAINT "FK_tenant_calibration_coefficients_tenant_user"
      FOREIGN KEY ("tenantUserId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "coefficient_change_events"
      ADD CONSTRAINT "FK_coefficient_change_events_tenant_user"
      FOREIGN KEY ("tenantUserId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "coefficient_change_events"
      ADD CONSTRAINT "FK_coefficient_change_events_feedback"
      FOREIGN KEY ("feedbackId") REFERENCES "estimate_feedbacks"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
    await queryRunner.query(`
      ALTER TABLE "estimate_feedbacks"
      ADD CONSTRAINT "FK_estimate_feedbacks_estimate"
      FOREIGN KEY ("estimateId") REFERENCES "estimates"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(): Promise<void> {
    throw new Error(
      'AddTenantCalibrationFoundation20261014000002 is forward-only and must not be reverted automatically.'
    );
  }
}
