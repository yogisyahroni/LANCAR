'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'tembus-theme';
const LEGACY_STORAGE_KEY = 'theme';

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

function resolveTheme(theme: ThemeMode, prefersDark: boolean): ResolvedTheme {
  return theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
}

function applyTheme(theme: ThemeMode, resolvedTheme: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', resolvedTheme === 'dark');
  root.style.colorScheme = resolvedTheme;
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const themeRef = useRef<ThemeMode>('system');

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const initialTheme: ThemeMode = isThemeMode(stored) ? stored : 'system';
    themeRef.current = initialTheme;

    const sync = (nextTheme: ThemeMode, prefersDark = media.matches) => {
      const nextResolved = resolveTheme(nextTheme, prefersDark);
      themeRef.current = nextTheme;
      setThemeState(nextTheme);
      setResolvedTheme(nextResolved);
      applyTheme(nextTheme, nextResolved);
    };

    sync(initialTheme);

    const handleSystemChange = (event: MediaQueryListEvent) => {
      if (themeRef.current === 'system') {
        sync('system', event.matches);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const nextTheme = isThemeMode(event.newValue) ? event.newValue : 'system';
      sync(nextTheme);
    };

    media.addEventListener?.('change', handleSystemChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      media.removeEventListener?.('change', handleSystemChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    const nextResolved = resolveTheme(nextTheme, window.matchMedia('(prefers-color-scheme: dark)').matches);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    themeRef.current = nextTheme;
    setThemeState(nextTheme);
    setResolvedTheme(nextResolved);
    applyTheme(nextTheme, nextResolved);
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
