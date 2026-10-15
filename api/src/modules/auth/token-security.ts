import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';
import { isUUID } from 'class-validator';
import {
  getRequiredConfig,
  JWT_ACCESS_SECRET_KEY,
  JWT_REFRESH_SECRET_KEY,
} from './jwt-config';

// Allow small issuer/verifier clock drift without extending token expiration.
export const JWT_IAT_CLOCK_SKEW_SECONDS = 30;

export const refreshTokenDigest = (token: string): string =>
  `sha256:${createHash('sha256').update(token, 'utf8').digest('hex')}`;

export function matchesRefreshToken(token: string, stored: string): boolean {
  if (
    typeof token !== 'string' ||
    typeof stored !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(stored)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(refreshTokenDigest(token)),
    Buffer.from(stored)
  );
}

export function tokenSecret(
  config: ConfigService,
  kind: 'access' | 'refresh'
): string {
  const primary =
    kind === 'access' ? JWT_ACCESS_SECRET_KEY : JWT_REFRESH_SECRET_KEY;
  const other =
    kind === 'access' ? JWT_REFRESH_SECRET_KEY : JWT_ACCESS_SECRET_KEY;
  const secret = getRequiredConfig(config, primary);
  if (secret === getRequiredConfig(config, other)) {
    throw new Error('JWT access and refresh secrets must be different');
  }
  return secret;
}

export function validateTokenClaims(
  payload: any,
  kind: 'access' | 'refresh'
): void {
  const now = Math.floor(Date.now() / 1000);
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    typeof payload.sub !== 'string' ||
    !isUUID(payload.sub) ||
    typeof payload.email !== 'string' ||
    !payload.email ||
    !Number.isSafeInteger(payload.iat) ||
    payload.iat < 0 ||
    payload.iat > now + JWT_IAT_CLOCK_SKEW_SECONDS ||
    !Number.isSafeInteger(payload.exp) ||
    payload.exp <= payload.iat ||
    payload.exp <= now
  ) {
    throw new UnauthorizedException('Invalid token claims');
  }
  if (kind === 'refresh') {
    if (
      payload.tokenUse !== 'refresh' ||
      typeof payload.jti !== 'string' ||
      !isUUID(payload.jti, '4')
    ) {
      throw new UnauthorizedException('Invalid refresh token identity');
    }
  } else if (payload.tokenUse !== undefined && payload.tokenUse !== 'access') {
    throw new UnauthorizedException('Invalid access token type');
  }
}
