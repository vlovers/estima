import { IsEmail, IsString } from 'class-validator';
import { IsWellFormedPassword } from '../password-validation';

export class LoginDto {
  @IsEmail()
  email: string;

  // Keep legacy credentials valid; registration enforces the minimum length.
  @IsString()
  @IsWellFormedPassword()
  password: string;
}
