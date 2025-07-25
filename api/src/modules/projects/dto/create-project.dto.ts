import { ProjectComplexity } from '../entities/project-complexity.enum';
import { ApiProperty } from '@nestjs/swagger';

import {
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsString,
  IsEnum,
  Min,
  Max,
} from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'Project Alpha', description: 'Project name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'A project to do great things',
    description: 'Project description',
  })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    description: 'The overall complexity of the project',
    enum: ProjectComplexity,
    default: ProjectComplexity.MEDIUM,
    required: false,
  })
  @IsEnum(ProjectComplexity)
  @IsOptional()
  complexity?: ProjectComplexity;

  @ApiProperty({
    description: 'Overhead percentage for non-coding tasks',
    example: 15,
    required: false,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  overhead?: number;
}
