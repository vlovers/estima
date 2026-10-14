import {
  IsNumber,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsString,
  IsEnum,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DeviationReason } from '../entities/estimate-feedback.entity';

export class CreateEstimateFeedbackDto {
  @ApiProperty({
    description: 'The ID of the task this feedback is for',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  taskId: string;

  @ApiProperty({
    description: 'Optional FINAL estimate ID this feedback is evaluating',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  estimateId?: string;

  @ApiProperty({
    description:
      'Optional client-supplied idempotency key for this task feedback',
    example: 'task-feedback-2026-10-14',
    required: false,
  })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  idempotencyKey?: string;

  @ApiProperty({
    description: 'The actual hours it took to complete the task',
    example: 12.5,
  })
  @IsNumber()
  actualHours: number;

  @ApiProperty({
    description: 'Rating of the AI estimate accuracy (1-5)',
    example: 4,
    required: false,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number;

  @ApiProperty({
    description: 'General comment about the task or estimate',
    example: 'The estimate was good, but I found some undocumented parts.',
    required: false,
  })
  @IsString()
  @IsOptional()
  comment?: string;

  @ApiProperty({
    description: 'The primary reason for any deviation from the estimate',
    enum: DeviationReason,
    example: DeviationReason.UNFORESEEN_TECHNICAL_COMPLEXITY,
    required: false,
  })
  @IsEnum(DeviationReason)
  @IsOptional()
  reasonForDeviation?: DeviationReason;

  @ApiProperty({
    description: 'Specific technical comment about the reason for deviation',
    example:
      'The Stripe API for subscriptions was more complex than anticipated.',
    required: false,
  })
  @IsString()
  @IsOptional()
  deviationComment?: string;

  @ApiProperty({
    description: 'Complexity tags that were missed during initial estimation',
    example: ['legacy_code', 'third_party_integration'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  missedComplexityTags?: string[];
}
