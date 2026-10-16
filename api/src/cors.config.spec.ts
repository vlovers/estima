import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { createCorsOptions } from './cors.config';

@Module({})
class CorsTestModule {}

describe('CORS configuration', () => {
  it('retains the separate development origin as the API default', () => {
    const previous = process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGINS;
    try {
      expect(createCorsOptions()).toEqual({
        origin: ['http://localhost:4200'],
        credentials: true,
      });
    } finally {
      if (previous === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = previous;
    }
  });

  it('reads and replaces defaults with the environment allowlist', () => {
    const previous = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = 'https://estima.example';
    try {
      expect(createCorsOptions()).toEqual({
        origin: ['https://estima.example'],
        credentials: true,
      });
    } finally {
      if (previous === undefined) delete process.env.CORS_ORIGINS;
      else process.env.CORS_ORIGINS = previous;
    }
  });

  it('trims and deduplicates exact origins', () => {
    expect(
      createCorsOptions(
        'http://localhost, http://localhost:4200,http://localhost'
      ).origin
    ).toEqual(['http://localhost', 'http://localhost:4200']);
  });

  it.each([
    '',
    '*',
    'null',
    'https://*.example.com',
    'ftp://example.com',
    'https://example.com/',
    'https://example.com/path',
    'https://user:password@example.com',
    'https://example.com?query=1',
    'https://example.com#fragment',
    'http://localhost,',
  ])('rejects invalid or broad allowlists: %s', (origin) => {
    expect(() => createCorsOptions(origin)).toThrow('CORS_ORIGINS');
  });

  describe.each([
    [
      'local Docker',
      'http://localhost,http://localhost:4200',
      ['http://localhost', 'http://localhost:4200'],
    ],
    [
      'production override',
      'https://estima.example',
      ['https://estima.example'],
    ],
  ])('%s preflight', (_name, origins, allowed) => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await NestFactory.create(CorsTestModule, { logger: false });
      app.enableCors(createCorsOptions(origins));
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it.each(allowed)(
      'allows credentialed JSON requests from %s',
      async (origin) => {
        const response = await request(app.getHttpServer())
          .options('/api/auth/login')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'POST')
          .set('Access-Control-Request-Headers', 'content-type,authorization')
          .expect(204);
        expect(response.headers['access-control-allow-origin']).toBe(origin);
        expect(response.headers['access-control-allow-credentials']).toBe(
          'true'
        );
        expect(response.headers.vary).toContain('Origin');
        expect(response.headers['access-control-allow-headers']).toBe(
          'content-type,authorization'
        );
      }
    );

    it.each(
      [
        'http://localhost',
        'http://localhost:4200',
        'https://evil.example',
        'http://localhost:4201',
        'http://localhost.evil.example',
        'null',
      ].filter((origin) => !allowed.includes(origin))
    )('does not permit %s', async (origin) => {
      const response = await request(app.getHttpServer())
        .options('/api/auth/refresh')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
