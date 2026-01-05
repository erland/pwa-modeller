import { useCallback, useEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'pwa-modeller-theme';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

function readStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;

  // Keep the browser UI (address bar etc.) in sync where supported.
  const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (meta) {
    meta.content = theme === 'dark' ? '#0b1220' : '#f6f7fb';
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme() ?? getSystemTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  return useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
}
