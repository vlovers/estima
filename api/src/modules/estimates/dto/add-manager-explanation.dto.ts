import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddManagerExplanationDto {
  @ApiProperty({
    example:
      'This estimate seems too low, we should account for potential refactoring.',
    description:
      "The manager's explanation or adjustment comment for the estimate.",
  })
  @IsString()
  @IsNotEmpty()
  explanation: string;
}
