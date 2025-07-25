import { EstimateSource } from '../entities/estimate.entity';
import { ApiProperty } from '@nestjs/swagger';

import {
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsString,
  IsEnum,
  IsUUID,
} from 'class-validator';

export class CreateEstimateDto {
  @ApiProperty({ example: 8, description: 'Final estimated duration in hours' })
  @IsNumber()
  @IsNotEmpty()
  finalEstimate: number;

  @ApiProperty({
    example: 10,
    description: 'User-provided manual estimate in hours',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  manualEstimate?: number;

  @ApiProperty({
    example: 0.9,
    description: 'Confidence level of the estimate',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  confidence?: number;

  @ApiProperty({ example: 'Based on similar past projects', required: false })
  @IsString()
  @IsOptional()
  explanation?: string;

  @ApiProperty({
    enum: EstimateSource,
    example: EstimateSource.AI,
    description: 'Source of the estimate',
  })
  @IsEnum(EstimateSource)
  source: EstimateSource;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'ID of the task being estimated',
  })
  @IsUUID()
  @IsNotEmpty()
  taskId: string;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'ID of the user who made the estimate',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  userId?: string;
}
