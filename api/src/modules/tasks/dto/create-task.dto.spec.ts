import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateTaskDto,
  IntegrationAuth,
  IntegrationDto,
  IntegrationInteraction,
  IntegrationType,
  TestingDto,
  UiDesignComplexity,
  MigrationComplexity,
  NfrDto,
  NfrCategory,
} from './create-task.dto';

function baseValidDto(): any {
  return {
    title: 'Implement login',
    description: 'Add email/password login',
    projectId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    tags: ['frontend'],
    technology: 'node',
    experienceLevel: 'MIDDLE',
    useAiEstimate: true,
    breakdown: true,
    testing: { unit: true, unitCoverageTarget: 70 } as TestingDto,
    documentation: { readme: true },
    complexityTags: ['refactor'],
    uiDesignComplexity: UiDesignComplexity.LOW,
    needsDataMigration: false,
    migrationComplexity: MigrationComplexity.LOW,
  };
}

describe('CreateTaskDto validation', () => {
  it('accepts a valid payload', async () => {
    const dto = plainToInstance(CreateTaskDto, baseValidDto());
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects unitCoverageTarget > 100', async () => {
    const payload = baseValidDto();
    payload.testing.unitCoverageTarget = 150;
    const dto = plainToInstance(CreateTaskDto, payload);
    const errors = await validate(dto);
    const hasRangeError = JSON.stringify(errors).includes('max');
    expect(hasRangeError).toBe(true);
  });

  it('validates IntegrationDto enums and required interaction', async () => {
    const payload = baseValidDto();
    payload.integrations = [
      {
        name: 'Stripe',
        type: IntegrationType.THIRD_PARTY,
        interaction: IntegrationInteraction.READ_WRITE,
        auth: IntegrationAuth.API_KEY,
      } as IntegrationDto,
      // invalid: wrong interaction value
      {
        name: 'CRM',
        type: IntegrationType.EXTERNAL,
        interaction: 'invalid',
      } as any,
    ];
    const dto = plainToInstance(CreateTaskDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates NFR category enum', async () => {
    const payload = baseValidDto();
    payload.nfrs = [
      { category: NfrCategory.PERFORMANCE, requirement: 'p95 < 300ms' } as NfrDto,
      { category: 'nonexistent', requirement: 'bad' } as any,
    ];
    const dto = plainToInstance(CreateTaskDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
