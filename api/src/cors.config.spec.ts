import { resolveCorsOrigins } from './cors.config';

describe('resolveCorsOrigins', () => {
  it('preserves the local development default', () => {
    expect(resolveCorsOrigins('')).toEqual(['http://localhost:4200']);
  });

  it('accepts a comma-separated HTTPS origin allowlist', () => {
    expect(resolveCorsOrigins('https://demo.example, https://app.example')).toEqual([
      'https://demo.example',
      'https://app.example',
    ]);
  });

  it.each([
    '*',
    'https://example.com/path',
    'https://example.com/',
    'ftp://example.com',
    'https://user:pass@example.com',
    'https://example.com,',
    'not-a-url',
  ])('rejects invalid or overly permissive origins: %s', (input) => {
    expect(() => resolveCorsOrigins(input)).toThrow();
  });
});
