import { ValidationPipe } from '@nestjs/common';

// Shared by the HTTP bootstrap and integration tests so both enforce the contract.
export const createAppValidationPipe = (): ValidationPipe =>
  new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
