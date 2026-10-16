import { ConfigService } from '@nestjs/config';
import { AccessTokenStrategy } from './access-token.strategy';
import { RefreshTokenStrategy } from './refresh-token.strategy';

describe('JWT strategies', () => {
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_SECRET: 'configured-access-secret',
        JWT_REFRESH_SECRET: 'configured-refresh-secret',
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  const userId = '11111111-1111-4111-8111-111111111111';
  const times = () => ({
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60,
  });

  it('standardizes access-token req.user shape', () => {
    const strategy = new AccessTokenStrategy(configService);

    expect(
      strategy.validate({ sub: userId, email: 'user@example.com', ...times() })
    ).toEqual({
      userId,
      email: 'user@example.com',
    });
  });

  it('standardizes refresh-token req.user shape and keeps refreshToken', () => {
    const strategy = new RefreshTokenStrategy(configService);

    expect(
      strategy.validate({ cookies: { refreshToken: 'refresh-token' } } as any, {
        sub: userId,
        email: 'user@example.com',
        ...times(),
        tokenUse: 'refresh',
        jti: '22222222-2222-4222-8222-222222222222',
      })
    ).toEqual({
      userId,
      email: 'user@example.com',
      refreshToken: 'refresh-token',
    });
  });

  it('fails fast when an access secret is missing', () => {
    const missingConfig = {
      get: jest.fn(() => ''),
    } as unknown as ConfigService;

    expect(() => new AccessTokenStrategy(missingConfig)).toThrow(
      'JWT_ACCESS_SECRET must be configured'
    );
  });

  it('fails fast when a refresh secret is missing', () => {
    const missingConfig = {
      get: jest.fn(() => ''),
    } as unknown as ConfigService;

    expect(() => new RefreshTokenStrategy(missingConfig)).toThrow(
      'JWT_REFRESH_SECRET must be configured'
    );
  });
  it('rejects identical access and refresh signing secrets at startup', () => {
    const sameConfig = {
      get: jest.fn(() => 'same-test-only-secret'),
    } as unknown as ConfigService;
    expect(() => new AccessTokenStrategy(sameConfig)).toThrow(
      'JWT access and refresh secrets must be different'
    );
    expect(() => new RefreshTokenStrategy(sameConfig)).toThrow(
      'JWT access and refresh secrets must be different'
    );
  });
});
