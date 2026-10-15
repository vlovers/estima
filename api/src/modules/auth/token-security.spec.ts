import { UnauthorizedException } from '@nestjs/common';
import {
  validateTokenClaims,
  JWT_IAT_CLOCK_SKEW_SECONDS,
} from './token-security';

describe('Token issue-time clock skew', () => {
  const now = 1800000000;
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(now * 1000));
  afterEach(() => jest.restoreAllMocks());

  it.each(['access', 'refresh'] as const)(
    'enforces the same bounded iat policy for %s',
    (kind) => {
      const claims = {
        sub: '11111111-1111-4111-8111-111111111111',
        email: 'user@example.com',
        tokenUse: kind,
        jti: '22222222-2222-4222-8222-222222222222',
        exp: now + 3600,
      };
      for (const offset of [-1, 0, JWT_IAT_CLOCK_SKEW_SECONDS]) {
        expect(() =>
          validateTokenClaims({ ...claims, iat: now + offset }, kind)
        ).not.toThrow();
      }
      for (const offset of [JWT_IAT_CLOCK_SKEW_SECONDS + 1, 3600]) {
        expect(() =>
          validateTokenClaims(
            { ...claims, iat: now + offset, exp: now + 7200 },
            kind
          )
        ).toThrow(UnauthorizedException);
      }
      // Issued-at tolerance must never extend expiration or permit malformed types.
      expect(() =>
        validateTokenClaims({ ...claims, iat: now - 60, exp: now }, kind)
      ).toThrow(UnauthorizedException);
      expect(() =>
        validateTokenClaims({ ...claims, iat: String(now) }, kind)
      ).toThrow(UnauthorizedException);
    }
  );
});
