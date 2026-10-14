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

  it('standardizes access-token req.user shape', () => {
    const strategy = new AccessTokenStrategy(configService);

    expect(
      strategy.validate({ sub: 'user-id', email: 'user@example.com' })
    ).toEqual({
      userId: 'user-id',
      email: 'user@example.com',
    });
  });

  it('standardizes refresh-token req.user shape and keeps refreshToken', () => {
    const strategy = new RefreshTokenStrategy(configService);

    expect(
      strategy.validate(
        { cookies: { refreshToken: 'refresh-token' } } as any,
        { sub: 'user-id', email: 'user@example.com' }
      )
    ).toEqual({
      userId: 'user-id',
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
});
