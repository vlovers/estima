import { ExperienceLevel } from '../entities/experience-level.enum';
import { ApiProperty } from '@nestjs/swagger';

import {
  ValidateNested,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsPositive,
  ValidateIf,
  IsBoolean,
  IsString,
  IsEnum,
  IsArray,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum NfrCategory {
  MAINTAINABILITY = 'maintainability',
  OBSERVABILITY = 'observability',
  PERFORMANCE = 'performance',
  COMPLIANCE = 'compliance',
  SCALABILITY = 'scalability',
  RELIABILITY = 'reliability',
  USABILITY = 'usability',
  SECURITY = 'security',
  COST = 'cost',
}

export class NfrDto {
  @ApiProperty({ enum: NfrCategory })
  @IsEnum(NfrCategory)
  category: NfrCategory;

  @ApiProperty({ description: 'Concrete requirement, e.g., p95 < 300ms' })
  @IsString()
  @IsNotEmpty()
  requirement: string;

  @ApiProperty({ required: false, description: 'Optional numeric/target note' })
  @IsString()
  @IsOptional()
  target?: string;
}

export enum IntegrationType {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
  THIRD_PARTY = 'third_party',
}

export enum IntegrationInteraction {
  READ = 'read',
  WRITE = 'write',
  READ_WRITE = 'read_write',
}

export enum IntegrationAuth {
  NONE = 'none',
  API_KEY = 'api_key',
  OAUTH = 'oauth',
  SAML = 'saml',
  BASIC = 'basic',
}

export class IntegrationDto {
  @ApiProperty({ description: 'System/service name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: IntegrationType, required: false })
  @IsEnum(IntegrationType)
  @IsOptional()
  type?: IntegrationType;

  @ApiProperty({ enum: IntegrationInteraction })
  @IsEnum(IntegrationInteraction)
  interaction: IntegrationInteraction;

  @ApiProperty({ enum: IntegrationAuth, required: false })
  @IsEnum(IntegrationAuth)
  @IsOptional()
  auth?: IntegrationAuth;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  sandbox?: boolean;
}

export class TestingDto {
  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  unit?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  integration?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  e2e?: boolean;

  @ApiProperty({ required: false, minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  unitCoverageTarget?: number; // %

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  performance?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  security?: boolean;
}

export class DocumentationDto {
  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  userDocs?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  apiDocs?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  readme?: boolean;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  changelog?: boolean;
}

export enum UiDesignComplexity {
  NONE = 'NONE',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum MigrationComplexity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum ComplexityTag {
  NEW_INFRA = 'new_infra',
  LEGACY_CODE = 'legacy_code',
  REFACTOR = 'refactor',
  MIGRATION = 'migration',
  THIRD_PARTY_INTEGRATION = 'third_party_integration',
  CONCURRENCY = 'concurrency',
  DATA_MODELING = 'data_modeling',
  AI_INTEGRATION = 'ai_integration',
  SECURITY_HARDENING = 'security_hardening',
  PERFORMANCE_CRITICAL = 'performance_critical',
}

export class CreateTaskDto {
  @ApiProperty({
    example: 'Implement login feature',
    description: 'Task title',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'Add email/password login',
    description: 'Task description',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ example: ['frontend', 'backend'], description: 'Task tags' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  // Acceptance criteria and scoping aids
  @ApiProperty({
    type: [String],
    required: false,
    description: 'Acceptance criteria (1-12 bullet points)'
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  acceptanceCriteria?: string[];

  @ApiProperty({ type: [String], required: false, description: 'Assumptions' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  assumptions?: string[];

  @ApiProperty({ type: [String], required: false, description: 'Constraints' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  constraints?: string[];

  // Non-functional requirements
  @ApiProperty({ type: () => [NfrDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NfrDto)
  @IsOptional()
  nfrs?: NfrDto[];

  // Integrations
  @ApiProperty({ type: () => [IntegrationDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IntegrationDto)
  @IsOptional()
  integrations?: IntegrationDto[];

  // Testing and documentation
  @ApiProperty({ type: () => TestingDto, required: false })
  @ValidateNested()
  @Type(() => TestingDto)
  @IsOptional()
  testing?: TestingDto;

  @ApiProperty({ type: () => DocumentationDto, required: false })
  @ValidateNested()
  @Type(() => DocumentationDto)
  @IsOptional()
  documentation?: DocumentationDto;

  @ApiProperty({ example: 'uuid-of-project', description: 'Project ID' })
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({
    example: 'React',
    description: 'Main technology for the task',
  })
  @IsString()
  @IsNotEmpty()
  technology: string;

  @ApiProperty({
    enum: ExperienceLevel,
    example: ExperienceLevel.MIDDLE,
    description: 'Required developer experience level',
  })
  @IsEnum(ExperienceLevel)
  @IsNotEmpty()
  experienceLevel: ExperienceLevel;

   // Complexity and design scope modifiers
  @ApiProperty({ enum: ComplexityTag, isArray: true, required: false })
  @IsArray()
  @IsEnum(ComplexityTag, { each: true })
  @IsOptional()
  complexityTags?: ComplexityTag[];

  @ApiProperty({ enum: UiDesignComplexity, required: false, default: UiDesignComplexity.NONE })
  @IsEnum(UiDesignComplexity)
  @IsOptional()
  uiDesignComplexity?: UiDesignComplexity;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  needsDataMigration?: boolean;

  @ApiProperty({ enum: MigrationComplexity, required: false })
  @IsEnum(MigrationComplexity)
  @IsOptional()
  migrationComplexity?: MigrationComplexity;

  @ApiProperty({
    description: 'Whether to break down the task into sub-tasks',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  breakdown?: boolean;

  @ApiProperty({
    example: 8,
    description: 'Positive manual hours; required when useAiEstimate is false',
    required: false,
    minimum: 0,
    exclusiveMinimum: true,
  })
  @ValidateIf(
    (dto, value) => dto.useAiEstimate === false || value !== undefined
  )
  @IsNumber()
  @IsPositive()
  manualEstimate?: number;

  @ApiProperty({
    example: true,
    description: 'Use AI to estimate task duration',
    required: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  useAiEstimate?: boolean;

  @ApiProperty({
    description: 'Whether to generate a manager note for the task',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  generateManagerNote?: boolean;

  @ApiProperty({
    description: 'Whether to generate a risk analysis for the task',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  generateRiskAnalysis?: boolean;
}
