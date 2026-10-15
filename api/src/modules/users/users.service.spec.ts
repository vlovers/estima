import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { verifyPassword } from '../auth/password-hashing';

describe('UsersService tenant isolation', () => {
  let userRepository: jest.Mocked<Repository<User>>;
  let service: UsersService;

  const userA = {
    id: 'user-a',
    email: 'a@example.com',
    password: 'password-hash-a',
    refreshToken: 'refresh-hash-a',
  } as User;

  beforeEach(() => {
    userRepository = {
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      find: jest.fn(),
      create: jest.fn((value) => value as User),
      insert: jest.fn(
        async () => ({ identifiers: [{ id: 'new-user' }] } as any)
      ),
      update: jest.fn(async () => ({ affected: 1 } as any)),
      delete: jest.fn(async () => ({ affected: 1 } as any)),
    } as unknown as jest.Mocked<Repository<User>>;

    service = new UsersService(userRepository);
  });

  it('returns only the authenticated user from list endpoints', async () => {
    userRepository.findOneBy.mockResolvedValue(userA);

    const result = await service.findAll('user-a');

    expect(result).toEqual([{ id: 'user-a', email: 'a@example.com' }]);
    expect(userRepository.find).not.toHaveBeenCalled();
  });

  it('does not expose password or refresh token hashes when creating users', async () => {
    userRepository.findOne.mockResolvedValue(null);

    const result = await service.create({
      email: 'new@example.com',
      password: 'password123',
    });

    expect(result).toEqual({
      id: 'new-user',
      email: 'new@example.com',
    });
    expect('password' in result).toBe(false);
    expect('refreshToken' in result).toBe(false);
  });

  it('hashes plaintext passwords exactly once before saving users', async () => {
    userRepository.findOne.mockResolvedValue(null);
    let savedUser: User;
    userRepository.insert.mockImplementation(async (value) => {
      savedUser = value as User;
      return { identifiers: [{ id: 'new-user' }] } as any;
    });

    await service.create({
      email: 'new@example.com',
      password: 'password123',
    });

    expect(savedUser.password).not.toBe('password123');
    await expect(
      verifyPassword('password123', savedUser.password)
    ).resolves.toBe(true);
    await expect(
      verifyPassword(savedUser.password, savedUser.password)
    ).resolves.toBe(false);
  });

  it('hashes password-looking strings instead of trusting hash prefixes', async () => {
    userRepository.findOne.mockResolvedValue(null);
    let savedUser: User;
    const trickyPassword = '$2not-a-real-bcrypt-hash';
    userRepository.insert.mockImplementation(async (value) => {
      savedUser = value as User;
      return { identifiers: [{ id: 'new-user' }] } as any;
    });

    await service.create({
      email: 'new@example.com',
      password: trickyPassword,
    });

    expect(savedUser.password).not.toBe(trickyPassword);
    await expect(
      verifyPassword(trickyPassword, savedUser.password)
    ).resolves.toBe(true);
  });

  it('rejects duplicate user creation', async () => {
    userRepository.findOne.mockResolvedValue(userA);

    await expect(
      service.create({ email: 'a@example.com', password: 'password123' })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows reading the authenticated user only', async () => {
    userRepository.findOneBy.mockResolvedValue(userA);

    await expect(service.findOwn('user-a', 'user-a')).resolves.toEqual({
      id: 'user-a',
      email: 'a@example.com',
    });
    await expect(service.findOwn('user-b', 'user-a')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('updates only the authenticated user and strips sensitive fields', async () => {
    userRepository.findOneBy.mockResolvedValue({
      ...userA,
      email: 'updated@example.com',
    } as User);

    const result = await service.updateOwn(
      'user-a',
      Object.assign(
        { email: 'updated@example.com', password: 'new-password' },
        { refreshToken: 'new-refresh-token', id: 'user-b', isAdmin: true }
      ),
      'user-a'
    );

    expect(userRepository.update).toHaveBeenCalledWith('user-a', {
      email: 'updated@example.com',
    });
    expect(result).toEqual({
      id: 'user-a',
      email: 'updated@example.com',
    });
  });

  it('clears refresh tokens without returning a user entity', async () => {
    const result = await service.clearRefreshToken('user-a');

    expect(userRepository.update).toHaveBeenCalledWith('user-a', {
      refreshToken: null,
    });
    expect(result).toEqual({ success: true });
    expect('password' in result).toBe(false);
    expect('refreshToken' in result).toBe(false);
  });

  it('deletes only the authenticated user by id or email', async () => {
    userRepository.findOneBy.mockResolvedValue(userA);

    await service.removeOwn('user-a', 'user-a');
    await service.removeOwnByEmail('a@example.com', 'user-a');

    expect(userRepository.delete).toHaveBeenCalledWith('user-a');
    expect(userRepository.delete).toHaveBeenCalledWith({ id: 'user-a' });
    await expect(service.removeOwn('user-b', 'user-a')).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(
      service.removeOwnByEmail('b@example.com', 'user-a')
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('maps the email uniqueness race to a controlled conflict', async () => {
    userRepository.findOne.mockResolvedValue(null);
    userRepository.insert.mockRejectedValueOnce(
      new QueryFailedError('INSERT users', [], {
        code: '23505',
        constraint: 'UQ_97672ac88f789774dd47f7c8be3',
      } as any)
    );
    await expect(
      service.create({ email: 'race@example.com', password: 'password123' })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('preserves unexpected database errors instead of misreporting an email conflict', async () => {
    userRepository.findOne.mockResolvedValue(null);
    const error = new QueryFailedError('INSERT users', [], {
      code: '23505',
      constraint: 'another_constraint',
    } as any);
    userRepository.insert.mockRejectedValueOnce(error);
    await expect(
      service.create({ email: 'race@example.com', password: 'password123' })
    ).rejects.toBe(error);
  });
});
