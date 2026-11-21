import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { CssBaseline, ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { applyDocumentLanguage } from '../i18n';
import type { Language } from '../types/api';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
  mode: ThemeMode;
  toggleTheme: () => void;
  setMode: (m: ThemeMode) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  direction: 'ltr' | 'rtl';
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = 'autopark.theme';

function getInitialTheme(): ThemeMode {
  try {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(THEME_KEY) : null;
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore
  }
  return 'dark';
}

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [mode, setModeState] = useState<ThemeMode>(getInitialTheme);
  const language: Language = i18n.language === 'ar' ? 'ar' : 'en';
  const direction: 'ltr' | 'rtl' = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(THEME_KEY, m);
    } catch {
      // ignore
    }
  };

  const toggleTheme = () => setMode(mode === 'dark' ? 'light' : 'dark');

  const setLanguage = (lang: Language) => {
    void i18n.changeLanguage(lang);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'ar' : 'en');
  };

  const emotionCache = useMemo(
    () =>
      createCache({
        key: direction === 'rtl' ? 'muirtl' : 'muiltr',
        stylisPlugins: direction === 'rtl' ? [prefixer, rtlPlugin] : [prefixer],
      }),
    [direction],
  );

  const theme = useMemo(
    () =>
      createTheme({
        direction,
        palette: {
          mode,
          primary: {
            main: mode === 'dark' ? '#38bdf8' : '#0284c7',
          },
          secondary: {
            main: mode === 'dark' ? '#a855f7' : '#7e22ce',
          },
          success: {
            main: '#22c55e',
          },
          warning: {
            main: '#f59e0b',
          },
          error: {
            main: '#ef4444',
          },
          info: {
            main: '#3b82f6',
          },
          background:
            mode === 'dark'
              ? { default: '#0b1120', paper: '#111827' }
              : { default: '#f1f5f9', paper: '#ffffff' },
        },
        typography: {
          fontFamily:
            language === 'ar'
              ? '"Tajawal", "Cairo", "Segoe UI", Tahoma, sans-serif'
              : '"Inter", "Segoe UI", Roboto, system-ui, sans-serif',
          h5: { fontWeight: 700 },
          h6: { fontWeight: 600 },
        },
        shape: { borderRadius: 8 },
        components: {
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: 'none',
                border: mode === 'dark' ? '1px solid rgba(148, 163, 184, 0.14)' : '1px solid #e2e8f0',
              },
            },
          },
          MuiButton: {
            styleOverrides: {
              root: {
                textTransform: 'none',
                fontWeight: 600,
              },
            },
          },
          MuiTableCell: {
            styleOverrides: {
              head: {
                fontWeight: 700,
                backgroundColor: mode === 'dark' ? '#1e293b' : '#f8fafc',
              },
            },
          },
        },
      }),
    [direction, mode, language],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      toggleTheme,
      setMode,
      language,
      setLanguage,
      toggleLanguage,
      direction,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, language, direction],
  );

  return (
    <ThemeContext.Provider value={value}>
      <CacheProvider value={emotionCache}>
        <MuiThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </MuiThemeProvider>
      </CacheProvider>
    </ThemeContext.Provider>
  );
};

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useAppTheme must be used within AppThemeProvider');
  return ctx;
}
