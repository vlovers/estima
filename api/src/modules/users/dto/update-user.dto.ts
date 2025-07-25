import { CreateUserDto } from './create-user.dto';
import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsString()
  @IsOptional()
  refreshToken?: string | null;
}
