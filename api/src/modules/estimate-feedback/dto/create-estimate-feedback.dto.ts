import { IsNumber, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEstimateFeedbackDto {
  @ApiProperty({
    description: 'The ID of the task this feedback is for',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsUUID()
  taskId: string;

  @ApiProperty({
    description: 'The actual hours it took to complete the task',
    example: 12.5,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  actualHours?: number;

  @ApiProperty({
    description: "The developer's manual estimate for the task",
    example: 10,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  userEstimate?: number;
}
