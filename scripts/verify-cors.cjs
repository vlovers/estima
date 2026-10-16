const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

async function verify() {
  if (process.argv[2] === '--compose') {
    for (const [configured, expected] of [
      [undefined, 'http://localhost,http://localhost:4200'],
      ['https://estima.example', 'https://estima.example'],
      ['', ''],
    ]) {
      const env = { ...process.env };
      delete env.CORS_ORIGINS;
      if (configured !== undefined) env.CORS_ORIGINS = configured;
      const config = JSON.parse(
        execFileSync(
          'docker',
          ['compose', 'config', '--no-env-resolution', '--format', 'json'],
          { env, encoding: 'utf8' }
        )
      );
      assert.equal(config.services.api.environment.CORS_ORIGINS, expected);
    }
    console.log(
      'PASS: Compose CORS defaults, explicit replacement and empty override'
    );
    return;
  }
  assert.equal(
    process.argv[2],
    '--runtime',
    'Use --compose or --runtime <API URL>'
  );
  const base = process.argv[3];
  assert.ok(base, 'Provide a disposable runtime API URL');
  for (const endpoint of ['login', 'refresh']) {
    for (const origin of [
      'http://localhost',
      'http://localhost:4200',
      'https://untrusted.example',
      'http://localhost.evil.example',
      'null',
    ]) {
      const allowed = ['http://localhost', 'http://localhost:4200'].includes(
        origin
      );
      const response = await fetch(new URL(`/api/auth/${endpoint}`, base), {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type,authorization',
        },
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(
        response.headers.get('access-control-allow-origin'),
        allowed ? origin : null
      );
      if (allowed) {
        assert.equal(response.status, 204);
        assert.equal(
          response.headers.get('access-control-allow-credentials'),
          'true'
        );
        assert.match(response.headers.get('vary'), /Origin/);
      }
    }
  }
  console.log(
    'PASS: Docker login/refresh preflights permit both local origins and reject untrusted origins'
  );
}

verify().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
