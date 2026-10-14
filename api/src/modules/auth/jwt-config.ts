import { ConfigService } from '@nestjs/config';

export const JWT_ACCESS_SECRET_KEY = 'JWT_ACCESS_SECRET';
export const JWT_REFRESH_SECRET_KEY = 'JWT_REFRESH_SECRET';

export function getRequiredConfig(
  configService: ConfigService,
  key: string
): string {
  const value = configService.get<string>(key);
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} must be configured`);
  }
  return value;
}
