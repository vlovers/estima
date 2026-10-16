import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function createCorsOptions(
  origins = process.env.CORS_ORIGINS ?? 'http://localhost:4200'
): CorsOptions {
  const allowlist = origins.split(',').map((origin) => origin.trim());

  for (const origin of allowlist) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(
        'CORS_ORIGINS must contain comma-separated HTTP(S) origins'
      );
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin ||
      origin.includes('*')
    ) {
      throw new Error(
        'CORS_ORIGINS must contain exact HTTP(S) origins without wildcards or paths'
      );
    }
  }

  return { origin: [...new Set(allowlist)], credentials: true };
}
