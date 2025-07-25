import { ExperienceLevel } from '../entities/experience-level.enum';
import { ApiProperty } from '@nestjs/swagger';

import {
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsString,
  IsEnum,
  IsArray,
  IsUUID,
} from 'class-validator';

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
    description: 'Flag to break down the task into subtasks',
    required: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  breakdown?: boolean;
}
