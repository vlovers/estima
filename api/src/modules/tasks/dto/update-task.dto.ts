import { CreateTaskDto } from './create-task.dto';
import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsNumber, IsPositive, ValidateIf } from 'class-validator';

export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['manualEstimate'] as const)
) {
  @ApiPropertyOptional({
    description: 'Positive manual hours; omit to keep the existing reference',
    minimum: 0,
    exclusiveMinimum: true,
  })
  @ValidateIf((_dto, value) => value !== undefined)
  @IsNumber()
  @IsPositive()
  manualEstimate?: number;
}
