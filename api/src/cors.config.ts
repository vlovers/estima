/**
 * Explicit CORS allowlist. Never enable wildcard origins with credentials.
 * CORS_ORIGINS is a comma-separated set of absolute HTTP(S) origins.
 */
export function resolveCorsOrigins(raw = process.env.CORS_ORIGINS): string[] {
  const origins = raw?.trim()
    ? raw.split(',').map((origin) => origin.trim())
    : ['http://localhost:4200'];

  if (origins.some((origin) => !origin)) {
    throw new Error('CORS_ORIGINS contains an empty origin');
  }

  return origins.map((origin) => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS_ORIGINS entry: ${origin}`);
    }

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error(`CORS_ORIGINS must contain explicit HTTP(S) origins: ${origin}`);
    }

    return origin;
  });
}
