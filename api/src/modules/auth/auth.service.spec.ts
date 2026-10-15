import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

describe('AuthService JWT configuration', () => {
  const usersService = {
    update: jest.fn(),
    create: jest.fn(),
    clearRefreshToken: jest.fn(),
    setRefreshToken: jest.fn(),
    findOne: jest.fn(),
    findOneByEmail: jest.fn(),
  } as unknown as UsersService;

  const buildService = (config: Record<string, string | undefined>) => {
    const jwtService = {
      signAsync: jest.fn(async (_payload, options) => {
        return options.secret === config.JWT_ACCESS_SECRET
          ? 'access-token'
          : 'refresh-token';
      }),
    } as unknown as jest.Mocked<JwtService>;

    const configService = {
      get: jest.fn((key: string) => config[key]),
    } as unknown as ConfigService;

    return {
      service: new AuthService(usersService, jwtService, configService),
      jwtService,
      usersService: usersService as jest.Mocked<UsersService>,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('signs access and refresh tokens with configured secrets and expirations', async () => {
    const { service, jwtService } = buildService({
      JWT_ACCESS_SECRET: 'configured-access-secret',
      JWT_REFRESH_SECRET: 'configured-refresh-secret',
      JWT_ACCESS_EXPIRES_IN: '10m',
      JWT_REFRESH_EXPIRES_IN: '10d',
    });

    const tokens = await service.getTokens('user-id', 'user@example.com');

    expect(tokens).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      1,
      { sub: 'user-id', email: 'user@example.com' },
      { secret: 'configured-access-secret', expiresIn: '10m' }
    );
    expect(jwtService.signAsync).toHaveBeenNthCalledWith(
      2,
      { sub: 'user-id', email: 'user@example.com', jti: expect.any(String) },
      { secret: 'configured-refresh-secret', expiresIn: '10d' }
    );
  });

  it('fails fast when access secret is missing', async () => {
    const { service } = buildService({
      JWT_ACCESS_SECRET: '',
      JWT_REFRESH_SECRET: 'configured-refresh-secret',
    });

    await expect(
      service.getTokens('user-id', 'user@example.com')
    ).rejects.toThrow('JWT_ACCESS_SECRET must be configured');
  });

  it('fails fast when refresh secret is missing', async () => {
    const { service } = buildService({
      JWT_ACCESS_SECRET: 'configured-access-secret',
      JWT_REFRESH_SECRET: ' ',
    });

    await expect(
      service.getTokens('user-id', 'user@example.com')
    ).rejects.toThrow('JWT_REFRESH_SECRET must be configured');
  });

  it('delegates registration password hashing to UsersService', async () => {
    const { service, usersService } = buildService({
      JWT_ACCESS_SECRET: 'configured-access-secret',
      JWT_REFRESH_SECRET: 'configured-refresh-secret',
    });
    usersService.create.mockResolvedValue({
      id: 'user-id',
      email: 'new@example.com',
    } as any);

    await service.register({
      email: 'new@example.com',
      password: 'password123',
    });

    expect(usersService.create).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
    });
  });

  it('logs out by clearing only the stored refresh token', async () => {
    const { service, usersService } = buildService({
      JWT_ACCESS_SECRET: 'configured-access-secret',
      JWT_REFRESH_SECRET: 'configured-refresh-secret',
    });
    usersService.clearRefreshToken.mockResolvedValue({ success: true });

    await expect(service.logout('user-id')).resolves.toEqual({ success: true });

    expect(usersService.clearRefreshToken).toHaveBeenCalledWith('user-id');
    expect(usersService.update).not.toHaveBeenCalled();
  });
});
