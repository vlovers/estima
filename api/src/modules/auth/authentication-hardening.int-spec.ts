import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../app.module';
import { createAppValidationPipe } from '../../validation.pipe';
import { AiEstimatorService } from '../ai-estimator/ai-estimator.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import {
  refreshTokenDigest,
  JWT_IAT_CLOCK_SKEW_SECONDS,
} from './token-security';
import {
  applyRuntimePostgresEnv,
  assertDisposableDockerIsolation,
  assertDisposablePostgresConfig,
  buildDisposableDatabaseName,
  createAdminDataSource,
  createFreshDatabase,
  createTargetDataSource,
  initializeWithRetry,
  readDisposablePostgresConfig,
  verifyNoApplicationTables,
  verifyTargetIdentity,
} from '../../database/testing/disposable-postgres-test-environment';

const ACCESS_SECRET = 'pr342-test-only-access-secret-32-characters';
const REFRESH_SECRET = 'pr342-test-only-refresh-secret-32-characters';
const DEFAULT_PASSWORD = 'test-only-password-123';
type Account = {
  id: string;
  email: string;
  access: string;
  refresh: string;
  cookie: string;
};

describe('Authentication hardening (disposable PostgreSQL HTTP)', () => {
  let app: INestApplication;
  let db: DataSource;
  let users: UsersService;
  let jwt: JwtService;
  const originalEnv = { ...process.env };
  const cookie = (response: request.Response): string => {
    const header = response.headers['set-cookie'];
    const value = Array.isArray(header) ? header[0] : header;
    expect(value).toEqual(expect.any(String));
    return value.split(';')[0];
  };
  const tokenFromCookie = (value: string) =>
    decodeURIComponent(value.slice('refreshToken='.length));
  const refresh = (value: string) =>
    request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', value);
  const stored = async (id: string) => {
    const [row] = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    return row;
  };
  const register = async (password = DEFAULT_PASSWORD): Promise<Account> => {
    const email = `${randomUUID()}@example.com`;
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    expect(response.body).toEqual({
      accessToken: expect.any(String),
      user: { id: expect.any(String), email },
    });
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.body.user).not.toHaveProperty('refreshToken');
    const value = cookie(response);
    expect(JSON.stringify(response.body)).not.toContain(tokenFromCookie(value));
    return {
      id: response.body.user.id,
      email,
      access: response.body.accessToken,
      refresh: tokenFromCookie(value),
      cookie: value,
    };
  };
  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });
  const sign = (
    account: Account,
    kind: 'access' | 'refresh',
    claims: Record<string, unknown> = {}
  ) =>
    jwt.signAsync(
      {
        sub: account.id,
        email: account.email,
        tokenUse: kind,
        ...(kind === 'refresh' ? { jti: randomUUID() } : {}),
        ...claims,
      },
      {
        secret: kind === 'access' ? ACCESS_SECRET : REFRESH_SECRET,
        algorithm: 'HS256',
        expiresIn: '1h',
      }
    );

  beforeAll(async () => {
    const config = readDisposablePostgresConfig(
      buildDisposableDatabaseName('ai_estimator_integration_test_auth342')
    );
    assertDisposablePostgresConfig(config);
    assertDisposableDockerIsolation(config);
    const admin = createAdminDataSource(config);
    await initializeWithRetry(admin);
    try {
      await createFreshDatabase(admin, config);
    } finally {
      await admin.destroy();
    }
    const target = createTargetDataSource(config);
    await initializeWithRetry(target);
    try {
      await verifyTargetIdentity(target, config);
      await verifyNoApplicationTables(target);
      await target.runMigrations({ transaction: 'all' });
    } finally {
      await target.destroy();
    }
    applyRuntimePostgresEnv(config);
    process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;
    process.env.JWT_REFRESH_SECRET = REFRESH_SECRET;
    process.env.OPENAI_API_KEY = 'not-used-by-authentication-tests';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AiEstimatorService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createAppValidationPipe());
    await app.init();
    db = app.get(DataSource);
    users = app.get(UsersService);
    jwt = app.get(JwtService);
    await verifyTargetIdentity(db, config);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (app) await app.close();
    process.env = originalEnv;
  });

  it('rotates the cookie and full-token digest, rejects replay, and preserves the response contract', async () => {
    const account = await register();
    expect((await stored(account.id)).refreshToken).toBe(
      refreshTokenDigest(account.refresh)
    );
    const result = await refresh(account.cookie).expect(200);
    expect(result.body).toEqual({
      accessToken: expect.any(String),
    });
    expect(result.body).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(result.body)).not.toContain(
      tokenFromCookie(cookie(result))
    );
    expect(result.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(result.headers['set-cookie'][0]).toContain('SameSite=Lax');
    expect((await stored(account.id)).refreshToken).toBe(
      refreshTokenDigest(tokenFromCookie(cookie(result)))
    );
    const beforeReplay = await stored(account.id);
    const replay = await refresh(account.cookie).expect(403);
    expect(replay.headers['set-cookie']).toBeUndefined();
    expect(await stored(account.id)).toEqual(beforeReplay);
    const next = await refresh(cookie(result)).expect(200);
    expect(tokenFromCookie(cookie(next))).not.toBe(
      tokenFromCookie(cookie(result))
    );
    await refresh(cookie(result)).expect(403);
  });

  it('issues unique refresh identities and supports rotation within the same second', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.now());
    const account = await register();
    const first = await refresh(account.cookie).expect(200);
    const second = await refresh(cookie(first)).expect(200);
    const tokens = [
      account.refresh,
      tokenFromCookie(cookie(first)),
      tokenFromCookie(cookie(second)),
    ];
    expect(new Set(tokens).size).toBe(3);
    const payloads = tokens.map((token) => jwt.decode(token));
    expect(new Set(payloads.map((payload) => payload.iat)).size).toBe(1);
    expect(new Set(payloads.map((payload) => payload.jti)).size).toBe(3);
    expect(payloads.every((payload) => payload.tokenUse === 'refresh')).toBe(
      true
    );
    await refresh(account.cookie).expect(403);
  });

  it("rejects a different validly signed refresh token sharing bcrypt's first 72 bytes", async () => {
    const account = await register();
    const alternate = await sign(account, 'refresh');
    expect(account.refresh.slice(0, 72)).toBe(alternate.slice(0, 72));
    expect(alternate).not.toBe(account.refresh);
    // Demonstrate the old primitive's collision while the real endpoint rejects it.
    expect(
      await bcrypt.compare(alternate, await bcrypt.hash(account.refresh, 4))
    ).toBe(true);
    const before = await stored(account.id);
    await refresh(`refreshToken=${alternate}`).expect(403);
    expect(await stored(account.id)).toEqual(before);
    await refresh(account.cookie).expect(200);
  });

  it('allows exactly one concurrent refresh after both requests read the same current token', async () => {
    const account = await register();
    const rotate = users.rotateRefreshToken.bind(users);
    let arrivals = 0;
    let release: () => void;
    const bothArrived = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest
      .spyOn(users, 'rotateRefreshToken')
      .mockImplementation(async (...args) => {
        if (++arrivals === 2) release();
        await bothArrived;
        return rotate(...args);
      });
    const results = await Promise.all([
      refresh(account.cookie),
      refresh(account.cookie),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 403]);
    expect(arrivals).toBe(2);
    const winner = results.find((result) => result.status === 200);
    const loser = results.find((result) => result.status === 403);
    expect(loser.headers['set-cookie']).toBeUndefined();
    expect((await stored(account.id)).refreshToken).toBe(
      refreshTokenDigest(tokenFromCookie(cookie(winner)))
    );
    jest.restoreAllMocks();
    await refresh(cookie(winner)).expect(200);
    await refresh(account.cookie).expect(403);
  });

  it('invalidates the rotated token on logout while preserving access-token lifetime semantics', async () => {
    const account = await register();
    const rotated = await refresh(account.cookie).expect(200);
    const result = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .auth(rotated.body.accessToken, { type: 'bearer' })
      .expect(200);
    expect(result.body).toEqual({ success: true });
    expect(result.headers['set-cookie'][0]).toContain('refreshToken=;');
    expect((await stored(account.id)).refreshToken).toBeNull();
    await refresh(cookie(rotated)).expect(403);
    await refresh(account.cookie).expect(403);
    await request(app.getHttpServer())
      .get(`/api/users/${account.id}`)
      .auth(account.access, { type: 'bearer' })
      .expect(200);
  });

  it('does not resurrect a session when logout wins before a paused refresh compare-and-swap', async () => {
    const account = await register();
    const rotate = users.rotateRefreshToken.bind(users);
    let arrived: () => void;
    let release: () => void;
    const reached = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest
      .spyOn(users, 'rotateRefreshToken')
      .mockImplementation(async (...args) => {
        arrived();
        await resume;
        return rotate(...args);
      });
    const inFlight = refresh(account.cookie).then((result) => result);
    await reached;
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .auth(account.access, { type: 'bearer' })
      .expect(200);
    release();
    expect((await inFlight).status).toBe(403);
    expect((await stored(account.id)).refreshToken).toBeNull();
  });

  it.each([
    'not-a-jwt',
    'j:{"token":"bad"}',
    'j:["bad"]',
    '',
    'x'.repeat(8193),
  ])('safely rejects malformed refresh cookie %#', async (value) => {
    await refresh(`refreshToken=${value}`).expect(401);
  });

  it('safely rejects missing cookies', async () => {
    await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);
  });

  it('rejects expired and invalidly signed tokens without changing stored state', async () => {
    const account = await register();
    const expired = await jwt.signAsync(
      {
        sub: account.id,
        email: account.email,
        tokenUse: 'refresh',
        jti: randomUUID(),
      },
      { secret: REFRESH_SECRET, expiresIn: -1 }
    );
    const invalid = await jwt.signAsync(
      {
        sub: account.id,
        email: account.email,
        tokenUse: 'refresh',
        jti: randomUUID(),
      },
      { secret: 'different-test-only-secret', expiresIn: '1h' }
    );
    const before = await stored(account.id);
    await refresh(`refreshToken=${expired}`).expect(401);
    await refresh(`refreshToken=${invalid}`).expect(401);
    const expiredAccess = await jwt.signAsync(
      { sub: account.id, email: account.email, tokenUse: 'access' },
      { secret: ACCESS_SECRET, expiresIn: -1 }
    );
    await request(app.getHttpServer())
      .get('/api/users')
      .auth(expiredAccess, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/users')
      .auth(invalid, { type: 'bearer' })
      .expect(401);
    expect(await stored(account.id)).toEqual(before);
  });

  it('rejects both access/refresh substitutions and signed tokens with the wrong purpose', async () => {
    const account = await register();
    await refresh(`refreshToken=${account.access}`).expect(401);
    await request(app.getHttpServer())
      .get('/api/users')
      .auth(account.refresh, { type: 'bearer' })
      .expect(401);
    const wrongRefresh = await sign(account, 'refresh', { tokenUse: 'access' });
    const wrongAccess = await sign(account, 'access', { tokenUse: 'refresh' });
    await refresh(`refreshToken=${wrongRefresh}`).expect(401);
    await request(app.getHttpServer())
      .get('/api/users')
      .auth(wrongAccess, { type: 'bearer' })
      .expect(401);
  });

  it.each([
    { sub: 'not-a-uuid' },
    { email: {} },
    { jti: 'not-a-uuid' },
    { tokenUse: undefined },
  ])('rejects malformed signed refresh claims %#', async (claims) => {
    const account = await register();
    const token = await sign(account, 'refresh', claims);
    await refresh(`refreshToken=${token}`).expect(401);
  });

  it.each(['expiration', 'issue time'])(
    'requires the %s claim',
    async (missing) => {
      const account = await register();
      // Use a standalone signer so the application's default expiresIn does not
      // silently repair the intentionally malformed fixture.
      const token = await new JwtService().signAsync(
        {
          sub: account.id,
          email: account.email,
          tokenUse: 'refresh',
          jti: randomUUID(),
        },
        {
          secret: REFRESH_SECRET,
          ...(missing === 'issue time'
            ? { expiresIn: '1h', noTimestamp: true }
            : {}),
        }
      );
      await refresh(`refreshToken=${token}`).expect(401);
    }
  );

  it.each([
    {},
    { email: [], password: DEFAULT_PASSWORD },
    { email: {}, password: DEFAULT_PASSWORD },
    { email: 'valid@example.com', password: [] },
    { email: 'valid@example.com', password: {} },
    { email: 'valid@example.com', password: null },
    { email: 'valid@example.com', password: DEFAULT_PASSWORD, role: 'admin' },
    [],
  ])('safely rejects malformed login request %#', async (body) => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(body)
      .expect(400);
  });

  it('rejects refresh body injection without consuming the legitimate token', async () => {
    const account = await register();
    const before = await stored(account.id);
    await refresh(account.cookie)
      .send({ refreshToken: account.refresh, userId: account.id })
      .expect(400);
    await refresh(account.cookie).send([]).expect(400);
    expect(await stored(account.id)).toEqual(before);
    await refresh(account.cookie).expect(200);
  });

  it.each([
    'a'.repeat(72),
    'a'.repeat(72) + 'original-suffix',
    '🙂'.repeat(18),
    '🙂'.repeat(18) + 'original-suffix',
  ])(
    'validates the full new ASCII/Unicode password beyond byte 72, case %#',
    async (password) => {
      const account = await register(password);
      expect((await stored(account.id)).password).toMatch(
        /^\$estima-scrypt-v1\$/
      );
      await login(account.email, password).expect(200);
      const alternate =
        Buffer.byteLength(password, 'utf8') === 72
          ? password + 'attacker-suffix'
          : password.replace('original-suffix', 'attacker-suffix');
      await login(account.email, alternate).expect(401);
    }
  );

  it.each([
    'legacy-password-123',
    'a'.repeat(72) + 'original-suffix',
    '🙂'.repeat(18) + 'original-suffix',
  ])(
    'preserves existing bcrypt login compatibility, case %#',
    async (password) => {
      const email = `${randomUUID()}@example.com`;
      const hash = await bcrypt.hash(password, 4);
      const [user] = await db.query(
        'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id',
        [email, hash]
      );
      await login(email, password).expect(200);
      const saved = await stored(user.id);
      if (Buffer.byteLength(password, 'utf8') < 72)
        expect(saved.password).toMatch(/^\$estima-scrypt-v1\$/);
      else expect(saved.password).toBe(hash);
      await login(email, password).expect(200);
    }
  );

  it('keeps a legacy access session valid and requires login instead of trusting a legacy bcrypt refresh verifier', async () => {
    const account = await register();
    const legacyAccess = await jwt.signAsync(
      { sub: account.id, email: account.email },
      { secret: ACCESS_SECRET, expiresIn: '15m' }
    );
    const legacyRefresh = await jwt.signAsync(
      { sub: account.id, email: account.email },
      { secret: REFRESH_SECRET, expiresIn: '7d' }
    );
    await db.query('UPDATE users SET "refreshToken" = $1 WHERE id = $2', [
      await bcrypt.hash(legacyRefresh, 4),
      account.id,
    ]);
    await request(app.getHttpServer())
      .get(`/api/users/${account.id}`)
      .auth(legacyAccess, { type: 'bearer' })
      .expect(200);
    const before = await stored(account.id);
    await refresh(`refreshToken=${legacyRefresh}`).expect(401);
    // Even a new-format token must not be matched against a legacy truncated hash.
    await refresh(account.cookie).expect(403);
    expect(await stored(account.id)).toEqual(before);
    const result = await login(account.email, DEFAULT_PASSWORD).expect(200);
    await refresh(cookie(result)).expect(200);
  });

  it('returns one success and a controlled conflict when both duplicate-email prechecks pass concurrently', async () => {
    const email = `${randomUUID()}@example.com`;
    const repository = app.get<Repository<User>>(getRepositoryToken(User));
    const find = repository.findOne.bind(repository);
    let arrivals = 0;
    let release: () => void;
    const both = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest
      .spyOn(repository, 'findOne')
      .mockImplementation(async (options: any) => {
        const result = await find(options);
        if (options.where?.email === email) {
          expect(result).toBeNull();
          if (++arrivals === 2) release();
          await both;
        }
        return result;
      });
    const results = await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post('/api/auth/register')
          .send({ email, password: DEFAULT_PASSWORD })
      )
    );
    expect(arrivals).toBe(2);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const conflict = results.find((result) => result.status === 409);
    expect(conflict.headers['set-cookie']).toBeUndefined();
    expect(
      await db.query('SELECT id FROM users WHERE email = $1', [email])
    ).toHaveLength(1);
    jest.restoreAllMocks();
    await login(email, DEFAULT_PASSWORD).expect(200);
  });
  it('keeps login and user responses free of refresh-token credentials', async () => {
    const account = await register();
    const result = await login(account.email, DEFAULT_PASSWORD).expect(200);
    expect(result.body).toEqual({
      accessToken: expect.any(String),
      user: { id: account.id, email: account.email },
    });
    expect(JSON.stringify(result.body)).not.toContain(
      tokenFromCookie(cookie(result))
    );
    const profile = await request(app.getHttpServer())
      .get(`/api/users/${account.id}`)
      .auth(result.body.accessToken, { type: 'bearer' })
      .expect(200);
    expect(profile.body).toEqual({ id: account.id, email: account.email });
  });

  it('sets only a secure HttpOnly refresh cookie in production', async () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const account = await register();
      const result = await refresh(account.cookie).expect(200);
      expect(result.body).toEqual({ accessToken: expect.any(String) });
      expect(result.headers['set-cookie'][0]).toContain('HttpOnly');
      expect(result.headers['set-cookie'][0]).toContain('Secure');
      expect(result.headers['set-cookie'][0]).toContain('SameSite=Lax');
      await refresh(cookie(result)).expect(200);
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it.each(['\ud800', '\ud801', '\udc00', '\udfff', '\ud800x', '\udc00\ud800'])(
    'rejects distinct malformed UTF-16 passwords before registration and login, case %#',
    async (suffix) => {
      const replacementPassword =
        'valid-password-' + suffix.replace(/[\ud800-\udfff]/g, '\ufffd');
      const account = await register(replacementPassword);
      const password = 'valid-password-' + suffix;
      const email = `${randomUUID()}@example.com`;
      const before = await stored(account.id);
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password })
        .expect(400);
      expect(
        await db.query('SELECT id FROM users WHERE email = $1', [email])
      ).toEqual([]);
      await login(account.email, password).expect(400);
      expect(await stored(account.id)).toEqual(before);
      await login(account.email, replacementPassword).expect(200);
    }
  );

  it.each(['access', 'refresh'] as const)(
    'accepts small clock skew and rejects future-issued %s tokens without changing state',
    async (kind) => {
      const account = await register();
      const now = Math.floor(Date.now() / 1000);
      jest.spyOn(Date, 'now').mockReturnValue(now * 1000);
      const tolerated = await sign(account, kind, {
        iat: now + JWT_IAT_CLOCK_SKEW_SECONDS,
      });
      const future = await sign(account, kind, {
        iat: now + JWT_IAT_CLOCK_SKEW_SECONDS + 1,
      });
      if (kind === 'refresh') {
        // A real matching verifier proves the JWT claims check rejects it first.
        await db.query('UPDATE users SET "refreshToken" = $1 WHERE id = $2', [
          refreshTokenDigest(future),
          account.id,
        ]);
        const before = await stored(account.id);
        const rejected = await refresh(`refreshToken=${future}`).expect(401);
        expect(rejected.headers['set-cookie']).toBeUndefined();
        expect(await stored(account.id)).toEqual(before);
        await db.query('UPDATE users SET "refreshToken" = $1 WHERE id = $2', [
          refreshTokenDigest(tolerated),
          account.id,
        ]);
        await refresh(`refreshToken=${tolerated}`).expect(200);
      } else {
        const before = await stored(account.id);
        await request(app.getHttpServer())
          .get('/api/users')
          .auth(future, { type: 'bearer' })
          .expect(401);
        expect(await stored(account.id)).toEqual(before);
        await request(app.getHttpServer())
          .get('/api/users')
          .auth(tolerated, { type: 'bearer' })
          .expect(200);
      }
    }
  );
});
