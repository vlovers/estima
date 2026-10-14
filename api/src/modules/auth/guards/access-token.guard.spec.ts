import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessTokenGuard } from './access-token.guard';

describe('AccessTokenGuard', () => {
  const buildContext = () =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as unknown as ExecutionContext;

  it('allows public routes without JWT validation', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => true),
    } as unknown as Reflector;
    const guard = new AccessTokenGuard(reflector);

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('delegates protected routes to the passport jwt guard', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => false),
    } as unknown as Reflector;
    const guard = new AccessTokenGuard(reflector);
    const passportCanActivate = jest
      .spyOn(Object.getPrototypeOf(AccessTokenGuard.prototype), 'canActivate')
      .mockReturnValue(true);

    expect(guard.canActivate(buildContext())).toBe(true);
    expect(passportCanActivate).toHaveBeenCalled();

    passportCanActivate.mockRestore();
  });
});
