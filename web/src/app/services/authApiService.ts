import { LoginCredentials, RegisterCredentials } from '../types';
import axios, { CanceledError, InternalAxiosRequestConfig } from 'axios';

const API_URL = 'http://localhost:3000/api'; // This should be in an env file

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for sending cookies
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    delete config.headers.Authorization;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;
let unauthenticated = false;
type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const saveAccessToken = (token: string) => {
  localStorage.setItem('token', token);
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
  unauthenticated = false;
};

const expireSession = () => {
  if (unauthenticated) return;
  unauthenticated = true;
  localStorage.removeItem('token');
  delete api.defaults.headers.common.Authorization;
  window.location.assign('/login');
};

const refreshAccessToken = (): Promise<string> => {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh', undefined, { timeout: 10000 })
      .then(({ data }) => {
        if (typeof data?.accessToken !== 'string' || !data.accessToken) {
          throw new Error('Invalid refresh response');
        }
        saveAccessToken(data.accessToken);
        return data.accessToken;
      })
      .catch((error: unknown) => {
        expireSession();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

// Cancel only this caller's wait, leaving a shared rotation usable by others.
const waitForRefresh = (
  promise: Promise<string>,
  signal: RetryConfig['signal']
): Promise<string> =>
  new Promise((resolve, reject) => {
    const abort = () => {
      signal?.removeEventListener?.('abort', abort);
      reject(new CanceledError('Request canceled'));
    };
    signal?.addEventListener?.('abort', abort);
    if (signal?.aborted) abort();
    promise.then(
      (token) => {
        signal?.removeEventListener?.('abort', abort);
        resolve(token);
      },
      (error) => {
        signal?.removeEventListener?.('abort', abort);
        reject(error);
      }
    );
  });

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (axios.isCancel(error) || !axios.isAxiosError(error)) throw error;
    const originalRequest = error?.config as RetryConfig | undefined;
    if (!originalRequest) throw error;
    // Handle refresh failures before any resource retry logic. A refresh can
    // never refresh itself, including when invoked directly by a caller.
    if (/(?:^|\/)auth\/refresh\/?(?:[?#]|$)/.test(originalRequest.url ?? '')) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        expireSession();
      }
      throw error;
    }
    if (error.response?.status !== 401) {
      throw error;
    }
    // Login and registration failures must not trigger a background refresh.
    if (
      /(?:^|\/)auth\/(?:login|register)\/?(?:[?#]|$)/.test(
        originalRequest.url ?? ''
      )
    ) {
      throw error;
    }
    if (originalRequest.signal?.aborted)
      throw new CanceledError('Request canceled');
    if (originalRequest._retry) {
      expireSession();
      throw error;
    }
    if (unauthenticated) throw error;
    originalRequest._retry = true;

    // A late 401 from the old token can use an already completed rotation.
    const currentToken = localStorage.getItem('token');
    const token =
      currentToken &&
      originalRequest.headers.Authorization !== `Bearer ${currentToken}`
        ? currentToken
        : await waitForRefresh(refreshAccessToken(), originalRequest.signal);
    originalRequest.headers.Authorization = `Bearer ${token}`;
    return api(originalRequest);
  }
);

export const login = async (credentials: LoginCredentials) => {
  const response = await api.post('/auth/login', credentials);
  if (response.data.accessToken) {
    saveAccessToken(response.data.accessToken);
  }
  return response.data;
};

export const register = async (credentials: RegisterCredentials) => {
  const response = await api.post('/auth/register', credentials);
  if (response.data.accessToken) {
    saveAccessToken(response.data.accessToken);
  }
  return response.data;
};

export const logout = async () => {
  await api.post('/auth/logout');
  localStorage.removeItem('token');
  delete api.defaults.headers.common.Authorization;
  unauthenticated = true;
};
