import { useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { refreshAccessToken, setAuthHandlers } from '../api/client';
import { authApi } from '../api/endpoints';
import { tokenStore } from '../api/tokenStore';
import type { AuthResponse, Permission, User } from '../types/api';
import { useToast } from './ToastContext';

export function hasPermission(user: User | null | undefined, perm: Permission): boolean {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  return user.permissions.includes(perm);
}

export function hasAnyPermission(user: User | null | undefined, perms: Permission[]): boolean {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  return perms.some((p) => user.permissions.includes(p));
}

export function getFirstAccessibleRoute(user: User | null | undefined): string | null {
  if (!user) return null;
  const routes: Array<{ path: string; perms: Permission[] }> = [
    { path: '/dashboard', perms: ['dashboard.view'] },
    { path: '/monitoring', perms: ['system.monitor'] },
    { path: '/parking', perms: ['parking.view'] },
    { path: '/vehicles', perms: ['vehicles.manage.own', 'vehicles.manage.any'] },
    { path: '/alarms', perms: ['alarms.view'] },
    { path: '/commands', perms: ['commands.view'] },
    { path: '/users', perms: ['users.manage'] },
    { path: '/audit', perms: ['audit.view', 'history.view.all', 'history.view.own', 'diagnostics.view'] },
    { path: '/config', perms: ['config.manage'] },
  ];
  for (const r of routes) {
    if (hasAnyPermission(user, r.perms)) return r.path;
  }
  return '/profile';
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  can: (perm: Permission) => boolean;
  canAny: (perms: Permission[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n, t } = useTranslation();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const applyAuth = useCallback(
    (res: AuthResponse) => {
      tokenStore.setTokens(res.accessToken, res.refreshToken);
      setUser(res.user);
      if (res.user.language && res.user.language !== i18n.language) {
        void i18n.changeLanguage(res.user.language);
      }
    },
    [i18n],
  );

  useEffect(() => {
    setAuthHandlers({
      onRefreshed: (res) => {
        setUser(res.user);
      },
      onSessionExpired: () => {
        setUser(null);
        queryClient.clear();
        notify(t('auth.sessionExpired'), 'warning');
      },
    });
  }, [notify, queryClient, t]);

  useEffect(() => {
    let active = true;
    const init = async () => {
      const rt = tokenStore.getRefreshToken();
      if (!rt) {
        if (active) setLoading(false);
        return;
      }
      try {
        await refreshAccessToken({ silent: true });
        if (active) {
          const me = await authApi.me();
          if (active) setUser(me);
        }
      } catch {
        tokenStore.clear();
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    void init();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<User> => {
      const res = await authApi.login(username, password);
      applyAuth(res);
      return res.user;
    },
    [applyAuth],
  );

  const logout = useCallback(async () => {
    const rt = tokenStore.getRefreshToken();
    try {
      if (rt) await authApi.logout(rt);
    } catch {
      // ignore logout error
    } finally {
      tokenStore.clear();
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const can = useCallback((perm: Permission) => hasPermission(user, perm), [user]);
  const canAny = useCallback((perms: Permission[]) => hasAnyPermission(user, perms), [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      login,
      logout,
      setUser,
      can,
      canAny,
    }),
    [user, loading, login, logout, can, canAny],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
