import { IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class Clarification {
  @IsString()
  question: string;

  @IsString()
  answer: string;
}

export class ClarifyTaskDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Clarification)
  clarifications: Clarification[];
}
