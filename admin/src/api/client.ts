import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import type { AuthResponse } from '../types/api';
import { tokenStore } from './tokenStore';

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

/** Base URL of the REST API. Relative by default (served through Vite proxy / nginx). */
export const API_BASE_URL: string = trimSlash(
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1',
);

/** Origin used for Socket.IO. Derived from VITE_API_BASE_URL when absolute, else same origin. */
export function getSocketOrigin(): string {
  const explicit = import.meta.env.VITE_SOCKET_URL as string | undefined;
  if (explicit) return trimSlash(explicit);
  if (/^https?:\/\//i.test(API_BASE_URL)) return new URL(API_BASE_URL).origin;
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
}

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 20000 });
/** Separate instance for refresh calls so it never goes through the 401 retry interceptor. */
export const refreshClient = axios.create({ baseURL: API_BASE_URL, timeout: 20000 });

interface AuthHandlers {
  onRefreshed?: (res: AuthResponse) => void;
  onSessionExpired?: () => void;
}
let handlers: AuthHandlers = {};
export function setAuthHandlers(h: AuthHandlers): void {
  handlers = h;
}

let refreshPromise: Promise<string> | null = null;

/**
 * Single-flight refresh: concurrent callers share one in-flight request.
 * Refresh tokens rotate, so issuing two refreshes in parallel would revoke the token family.
 */
export function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) {
    return Promise.reject(new Error('NO_REFRESH_TOKEN'));
  }
  refreshPromise = refreshClient
    .post<AuthResponse>('/auth/refresh', { refreshToken })
    .then((res) => {
      tokenStore.setTokens(res.data.accessToken, res.data.refreshToken);
      handlers.onRefreshed?.(res.data);
      return res.data.accessToken;
    })
    .catch((err: unknown) => {
      tokenStore.clear();
      handlers.onSessionExpired?.();
      throw err;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

const AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];
function isAuthPath(url: string | undefined): boolean {
  return !!url && AUTH_PATHS.some((p) => url.includes(p));
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccessToken();
  if (token && !isAuthPath(config.url)) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

type RetriableConfig = AxiosRequestConfig & { _retry?: boolean };

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthPath(original.url) &&
      tokenStore.getRefreshToken()
    ) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newToken}` };
      return api.request(original);
    }
    return Promise.reject(error);
  },
);
