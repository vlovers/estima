import { EstimateSource } from '../../estimates/entities/estimate.entity';
import { ApiProperty } from '@nestjs/swagger';

import {
  IsOptional,
  IsNumber,
  IsString,
  IsEnum,
  Max,
  Min,
} from 'class-validator';

export class EstimateDto {
  @ApiProperty({
    enum: ['AI', 'MANUAL', 'FINAL'],
    example: 'AI',
    description: 'Source of the estimate',
  })
  @IsEnum(EstimateSource)
  source: EstimateSource;

  @ApiProperty({
    example: 5.5,
    description: 'Final estimated duration in hours',
  })
  @IsNumber()
  finalEstimate: number;

  @ApiProperty({
    example: 0.8,
    description: 'Confidence level of the estimate (from 0 to 1)',
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  @ApiProperty({ example: 'Based on similar past projects', required: false })
  @IsString()
  @IsOptional()
  explanation?: string;
}
