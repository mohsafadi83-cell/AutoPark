/**
 * Token storage.
 * - Access token: in memory only (never persisted) -> lost on reload, recovered via refresh token.
 * - Refresh token: sessionStorage (scoped to the tab, cleared when the tab closes).
 */
const REFRESH_KEY = 'autopark.refreshToken';

type Listener = (accessToken: string | null) => void;

let accessToken: string | null = null;
const listeners = new Set<Listener>();

function safeSession(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },
  getRefreshToken(): string | null {
    return safeSession()?.getItem(REFRESH_KEY) ?? null;
  },
  setTokens(access: string, refresh: string): void {
    accessToken = access;
    safeSession()?.setItem(REFRESH_KEY, refresh);
    listeners.forEach((l) => l(accessToken));
  },
  clear(): void {
    accessToken = null;
    safeSession()?.removeItem(REFRESH_KEY);
    listeners.forEach((l) => l(null));
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
