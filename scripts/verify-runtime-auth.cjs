const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

async function verify() {
  const base = new URL(process.argv[2]);
  assert.ok(
    ['localhost', '127.0.0.1'].includes(base.hostname),
    'Use a disposable loopback runtime'
  );
  const email = `consolidation-${randomUUID()}@example.test`;
  const password = `Runtime-check-${randomUUID()}`;
  const call = async (
    endpoint,
    { body, cookie, access, method = 'POST' } = {}
  ) => {
    const response = await fetch(new URL(`/api/${endpoint}`, base), {
      method,
      headers: {
        Origin: 'http://localhost',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    return response;
  };
  const cookie = (response) => {
    const value = response.headers.get('set-cookie');
    assert.ok(value?.includes('HttpOnly'), 'Refresh cookie must be HttpOnly');
    assert.ok(
      value.includes('Secure'),
      'Production refresh cookie must be Secure'
    );
    assert.ok(value.includes('SameSite=Lax'), 'Preserve SameSite policy');
    return value.split(';')[0];
  };
  let account;
  let access;
  try {
    const registered = await call('auth/register', {
      body: { email, password },
    });
    assert.equal(registered.status, 201, 'Registration failed');
    account = await registered.json();
    access = account.accessToken;
    cookie(registered);
    assert.equal(account.refreshToken, undefined);
    assert.equal(account.user.refreshToken, undefined);
    const loggedIn = await call('auth/login', { body: { email, password } });
    assert.equal(loggedIn.status, 200);
    const loginBody = await loggedIn.json();
    assert.equal(loginBody.refreshToken, undefined);
    const previousCookie = cookie(loggedIn);
    const refreshed = await call('auth/refresh', { cookie: previousCookie });
    assert.equal(refreshed.status, 200);
    const refreshBody = await refreshed.json();
    assert.deepEqual(Object.keys(refreshBody), ['accessToken']);
    access = refreshBody.accessToken;
    const currentCookie = cookie(refreshed);
    assert.ok(currentCookie !== previousCookie, 'Refresh identity must rotate');
    assert.equal(
      (await call('auth/refresh', { cookie: previousCookie })).status,
      403
    );
    assert.equal(
      (await call('auth/logout', { cookie: currentCookie, access })).status,
      200
    );
    assert.equal(
      (await call('auth/refresh', { cookie: currentCookie })).status,
      403
    );
    console.log(
      'PASS: production-image registration, login, cookie rotation, replay rejection and logout'
    );
  } finally {
    if (account?.user?.id && access) {
      const removed = await call(`users/${account.user.id}`, {
        method: 'DELETE',
        access,
      });
      assert.equal(
        removed.status,
        200,
        'Temporary runtime account cleanup failed'
      );
    }
  }
}

verify().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
