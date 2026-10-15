import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const buildController = () => {
    const authService = {
      login: jest.fn(async () => ({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })),
      register: jest.fn(),
      logout: jest.fn(async () => ({ success: true })),
      refreshTokens: jest.fn(async () => ({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      })),
    } as unknown as jest.Mocked<AuthService>;

    const controller = new AuthController(authService);
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    return { authService, controller, response };
  };

  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('preserves login response shape and refresh cookie name', async () => {
    process.env.NODE_ENV = 'development';
    const { authService, controller, response } = buildController();
    const req = {
      user: {
        id: 'user-id',
        email: 'user@example.com',
        password: 'hashed-password',
        refreshToken: 'hashed-refresh-token',
      },
    };

    const result = await controller.login(req, response as any);

    expect(authService.login).toHaveBeenCalledWith(req.user);
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
      }
    );
    expect(result).toEqual({
      accessToken: 'access-token',
      user: {
        id: 'user-id',
        email: 'user@example.com',
      },
    });
  });

  it('uses secure refresh cookies in production', async () => {
    process.env.NODE_ENV = 'production';
    const { controller, response } = buildController();

    await controller.login(
      { user: { id: 'user-id', email: 'user@example.com' } },
      response as any
    );

    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token',
      expect.objectContaining({ secure: true })
    );
  });

  it('logs out with standardized userId and clears refresh cookie', () => {
    const { authService, controller, response } = buildController();

    const result = controller.logout('user-id', response as any);

    expect(authService.logout).toHaveBeenCalledWith('user-id');
    expect(response.clearCookie).toHaveBeenCalledWith(
      'refreshToken',
      expect.objectContaining({ httpOnly: true })
    );
    return expect(result).resolves.toEqual({ success: true });
  });

  it('refreshes tokens with standardized userId and refreshToken', async () => {
    process.env.NODE_ENV = 'production';
    const { authService, controller, response } = buildController();

    const result = await controller.refreshTokens(
      'user-id',
      'refresh-token',
      response as any
    );

    expect(authService.refreshTokens).toHaveBeenCalledWith(
      'user-id',
      'refresh-token'
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'refreshToken',
      'new-refresh-token',
      { httpOnly: true, secure: true, sameSite: 'lax' }
    );
    expect(result).toEqual({ accessToken: 'new-access-token' });
    expect(result).not.toHaveProperty('refreshToken');
  });
});
