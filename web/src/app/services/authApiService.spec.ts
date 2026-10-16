import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const response = (
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown = {}
): AxiosResponse => {
  const value = {
    config,
    status,
    statusText: String(status),
    headers: {},
    data,
  };
  if (status >= 400)
    throw new AxiosError(
      `HTTP ${status}`,
      'ERR_BAD_RESPONSE',
      config,
      undefined,
      value
    );
  return value;
};

describe('Authentication refresh interception with real Axios interceptors', () => {
  let auth: typeof import('./authApiService');
  let redirect: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    localStorage.setItem('token', 'old-access');
    redirect = vi.fn();
    vi.stubGlobal('window', {
      location: { href: 'http://localhost/', assign: redirect },
    });
    auth = await import('./authApiService');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('rejects resource 401 followed by refresh 401 without recursively waiting on itself', async () => {
    const calls: string[] = [];
    auth.api.defaults.adapter = async (config) => {
      calls.push(config.url!);
      return response(config, 401);
    };
    await expect(auth.api.get('/resource')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(calls).toEqual(['/resource', '/auth/refresh']);
    expect(localStorage.getItem('token')).toBeNull();
    expect(auth.api.defaults.headers.common.Authorization).toBeUndefined();
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/login');
  }, 2000);

  it.each([401, 403, 503])(
    'settles all concurrent waiters after refresh HTTP %s with one refresh attempt',
    async (status) => {
      const gate = deferred<void>();
      let refreshCalls = 0;
      let resources = 0;
      auth.api.defaults.adapter = async (config) => {
        if (config.url === '/auth/refresh') {
          refreshCalls++;
          await gate.promise;
          return response(config, status);
        }
        resources++;
        return response(config, 401);
      };
      const settled = Promise.allSettled([
        auth.api.get('/a'),
        auth.api.get('/b'),
        auth.api.get('/c'),
      ]);
      await vi.waitFor(() => {
        expect(resources).toBe(3);
        expect(refreshCalls).toBe(1);
      });
      gate.resolve();
      const results = await settled;
      expect(results.every((item) => item.status === 'rejected')).toBe(true);
      expect(redirect).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem('token')).toBeNull();
      await expect(auth.api.get('/late')).rejects.toMatchObject({
        response: { status: 401 },
      });
      expect(refreshCalls).toBe(1);
    },
    2000
  );

  it('shares a successful cookie-based refresh, retries every request once, and handles a late old-token 401', async () => {
    const gate = deferred<void>();
    const late = deferred<void>();
    const calls: string[] = [];
    let refreshCalls = 0;
    auth.api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') {
        refreshCalls++;
        expect(config.withCredentials).toBe(true);
        expect(config.data).toBeUndefined();
        expect(config.timeout).toBe(10000);
        await gate.promise;
        // The frontend needs no refreshToken response property.
        return response(config, 200, { accessToken: 'new-access' });
      }
      calls.push(`${config.url}:${config.headers.Authorization}`);
      if (config.headers.Authorization === 'Bearer old-access') {
        if (config.url === '/late') await late.promise;
        return response(config, 401);
      }
      return response(config, 200, { ok: true });
    };
    const requests = [
      auth.api.get('/a'),
      auth.api.get('/b'),
      auth.api.get('/late'),
    ];
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    gate.resolve();
    await Promise.all(requests.slice(0, 2));
    late.resolve();
    const results = await Promise.all(requests);
    expect(results.every((value) => value.data.ok)).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(
      calls.filter((value) => value.endsWith(':Bearer new-access'))
    ).toHaveLength(3);
    expect(localStorage.getItem('token')).toBe('new-access');
    expect(redirect).not.toHaveBeenCalled();
  }, 2000);

  it('does not start a second refresh when the retried resource still returns 401', async () => {
    let refreshCalls = 0;
    let resources = 0;
    auth.api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') {
        refreshCalls++;
        return response(config, 200, { accessToken: 'new-access' });
      }
      resources++;
      return response(config, 401);
    };
    await expect(auth.api.get('/resource')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(refreshCalls).toBe(1);
    expect(resources).toBe(2);
    expect(localStorage.getItem('token')).toBeNull();
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it.each(['ERR_NETWORK', 'ECONNABORTED'])(
    'settles concurrent callers on refresh %s',
    async (code) => {
      const gate = deferred<void>();
      let refreshCalls = 0;
      auth.api.defaults.adapter = async (config) => {
        if (config.url === '/auth/refresh') {
          refreshCalls++;
          await gate.promise;
          throw new AxiosError('Refresh failed', code, config);
        }
        return response(config, 401);
      };
      const settled = Promise.allSettled([
        auth.api.get('/a'),
        auth.api.get('/b'),
      ]);
      await vi.waitFor(() => expect(refreshCalls).toBe(1));
      gate.resolve();
      expect(
        (await settled).every(
          (item) => item.status === 'rejected' && item.reason.code === code
        )
      ).toBe(true);
      expect(localStorage.getItem('token')).toBeNull();
      expect(redirect).toHaveBeenCalledTimes(1);
    },
    2000
  );

  it('cancels one waiting request promptly without canceling shared rotation or replaying the aborted request', async () => {
    const gate = deferred<void>();
    const controller = new AbortController();
    const calls: string[] = [];
    let refreshCalls = 0;
    auth.api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') {
        refreshCalls++;
        await gate.promise;
        return response(config, 200, { accessToken: 'new-access' });
      }
      calls.push(config.url!);
      return response(
        config,
        config.headers.Authorization === 'Bearer new-access' ? 200 : 401
      );
    };
    const aborted = auth.api
      .get('/canceled', { signal: controller.signal })
      .catch((error) => error);
    const survivor = auth.api.get('/survivor');
    await vi.waitFor(() => {
      expect(refreshCalls).toBe(1);
      expect(calls).toHaveLength(2);
    });
    controller.abort();
    expect(axios.isCancel(await aborted)).toBe(true);
    expect(localStorage.getItem('token')).toBe('old-access');
    gate.resolve();
    await expect(survivor).resolves.toMatchObject({ status: 200 });
    expect(calls.filter((url) => url === '/canceled')).toHaveLength(1);
    expect(refreshCalls).toBe(1);
    expect(redirect).not.toHaveBeenCalled();
  }, 2000);

  it('rejects an already-canceled request without refreshing', async () => {
    const adapter = vi.fn();
    auth.api.defaults.adapter = adapter;
    const controller = new AbortController();
    controller.abort();
    const result = await auth.api
      .get('/resource', { signal: controller.signal })
      .catch((error) => error);
    expect(axios.isCancel(result)).toBe(true);
    expect(adapter).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('rejects a resource network failure without attempting refresh or clearing the session', async () => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Offline', 'ERR_NETWORK', config);
    });
    auth.api.defaults.adapter = adapter;
    await expect(auth.api.get('/resource')).rejects.toMatchObject({
      code: 'ERR_NETWORK',
    });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('token')).toBe('old-access');
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    new Error('Unexpected adapter failure'),
    new AxiosError('No config'),
  ])(
    'rejects errors lacking request metadata without starting refresh, case %#',
    async (error) => {
      const adapter = vi.fn(async () => {
        throw error;
      });
      auth.api.defaults.adapter = adapter;
      await expect(auth.api.get('/resource')).rejects.toBe(error);
      expect(adapter).toHaveBeenCalledTimes(1);
      expect(redirect).not.toHaveBeenCalled();
    }
  );

  it.each([
    '/auth/refresh',
    '/auth/refresh/',
    '/auth/refresh?test=1',
    'http://localhost:3000/api/auth/refresh?test=1',
    '/auth/login',
    '/auth/register',
  ])(
    'never recursively refreshes an authentication endpoint: %s',
    async (url) => {
      const adapter = vi.fn(async (config: InternalAxiosRequestConfig) =>
        response(config, 401)
      );
      auth.api.defaults.adapter = adapter;
      await expect(auth.api.post(url)).rejects.toMatchObject({
        response: { status: 401 },
      });
      expect(adapter).toHaveBeenCalledTimes(1);
    },
    2000
  );

  it('refreshes expired access before logout, then clears the local session', async () => {
    const calls: string[] = [];
    auth.api.defaults.adapter = async (config) => {
      calls.push(`${config.url}:${config.headers.Authorization}`);
      if (config.url === '/auth/refresh')
        return response(config, 200, { accessToken: 'new-access' });
      return response(
        config,
        config.headers.Authorization === 'Bearer new-access' ? 200 : 401
      );
    };
    await auth.logout();
    expect(calls).toEqual([
      '/auth/logout:Bearer old-access',
      '/auth/refresh:Bearer old-access',
      '/auth/logout:Bearer new-access',
    ]);
    expect(localStorage.getItem('token')).toBeNull();
    expect(auth.api.defaults.headers.common.Authorization).toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([{}, { accessToken: 123 }])(
    'fails closed on malformed refresh response %#',
    async (body) => {
      auth.api.defaults.adapter = async (config) =>
        config.url === '/auth/refresh'
          ? response(config, 200, body)
          : response(config, 401);
      await expect(auth.api.get('/resource')).rejects.toThrow(
        'Invalid refresh response'
      );
      expect(localStorage.getItem('token')).toBeNull();
      expect(redirect).toHaveBeenCalledTimes(1);
    }
  );

  it.each([200, 403, 401])(
    'QA matrix: three protected requests settle after refresh %s',
    async (status) => {
      const gate = deferred<void>();
      let refreshCalls = 0;
      const protectedCalls: string[] = [];
      auth.api.defaults.headers.common.Authorization = 'Bearer old-access';
      auth.api.defaults.adapter = async (config) => {
        if (config.url === '/auth/refresh') {
          refreshCalls++;
          await gate.promise;
          return response(
            config,
            status,
            status === 200 ? { accessToken: 'new-access' } : {}
          );
        }
        protectedCalls.push(`${config.url}:${config.headers.Authorization}`);
        return response(
          config,
          config.headers.Authorization === 'Bearer new-access' ? 200 : 401,
          { ok: true }
        );
      };
      const pending = Promise.allSettled([
        auth.api.get('/protected/a'),
        auth.api.get('/protected/b'),
        auth.api.get('/protected/c'),
      ]);
      // Force all three 401s to arrive while the same refresh is still pending.
      await vi.waitFor(() => {
        expect(protectedCalls).toHaveLength(3);
        expect(refreshCalls).toBe(1);
      });
      gate.resolve();
      const results = await pending;
      expect(refreshCalls).toBe(1);
      if (status === 200) {
        expect(
          results.every(
            (result) => result.status === 'fulfilled' && result.value.data.ok
          )
        ).toBe(true);
        expect(protectedCalls).toHaveLength(6);
        expect(localStorage.getItem('token')).toBe('new-access');
        expect(redirect).not.toHaveBeenCalled();
      } else {
        expect(
          results.every(
            (result) =>
              result.status === 'rejected' &&
              result.reason.response.status === status
          )
        ).toBe(true);
        expect(protectedCalls).toHaveLength(3);
        expect(localStorage.getItem('token')).toBeNull();
        expect(auth.api.defaults.headers.common.Authorization).toBeUndefined();
        expect(redirect).toHaveBeenCalledExactlyOnceWith('/login');
      }
    },
    2000
  );

  it('QA matrix: direct refresh 401 rejects once, clears authentication, and triggers sign-in recovery', async () => {
    const calls: string[] = [];
    auth.api.defaults.headers.common.Authorization = 'Bearer old-access';
    auth.api.defaults.adapter = async (config) => {
      calls.push(config.url!);
      return response(config, 401);
    };
    await expect(auth.api.post('/auth/refresh')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(calls).toEqual(['/auth/refresh']);
    expect(localStorage.getItem('token')).toBeNull();
    expect(auth.api.defaults.headers.common.Authorization).toBeUndefined();
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/login');
    // A late protected failure cannot start another refresh after expiry.
    await expect(auth.api.get('/protected/late')).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(calls).toEqual(['/auth/refresh', '/protected/late']);
    expect(redirect).toHaveBeenCalledTimes(1);
  }, 2000);

  it('permits explicit sign-in after a failed refresh and clears terminal unauthenticated state', async () => {
    auth.api.defaults.adapter = async (config) => {
      if (config.url === '/auth/login')
        return response(config, 200, {
          accessToken: 'signed-in-access',
          user: {},
        });
      if (config.headers.Authorization === 'Bearer signed-in-access')
        return response(config, 200);
      return response(config, 401);
    };
    await expect(auth.api.get('/resource')).rejects.toBeDefined();
    await auth.login({ email: 'user@example.com', password: 'password123' });
    await expect(auth.api.get('/resource')).resolves.toMatchObject({
      status: 200,
    });
    expect(localStorage.getItem('token')).toBe('signed-in-access');
  });
});
