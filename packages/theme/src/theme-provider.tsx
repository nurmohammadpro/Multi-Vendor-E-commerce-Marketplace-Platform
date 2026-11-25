'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

export type ThemeName = 'slate-pro' | 'stone-sky' | 'emerald-cream' | 'ocean-sand' | 'merch-flow';
export type ColorMode = 'light' | 'dark' | 'system';

export type ThemeContextValue = {
  /** The selected theme name */
  theme: ThemeName;
  /** The selected color mode */
  mode: ColorMode;
  /** Switch to a different theme */
  setTheme: (theme: ThemeName) => void;
  /** Switch to a different color mode */
  setMode: (mode: ColorMode) => void;
  /** The resolved color mode after applying system preference */
  resolvedMode: 'light' | 'dark';
};

const STORAGE_KEY = 'mvp-theme';

type StoredPrefs = { theme: ThemeName; mode: ColorMode };

function readStoredPrefs(): StoredPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredPrefs;
  } catch {
    // localStorage unavailable or corrupt
  }
  return null;
}

function writeStoredPrefs(prefs: StoredPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage unavailable
  }
}

function getSystemMode(): 'light' | 'dark' {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = {
  children: ReactNode;
  /** Default theme name when no stored preference exists */
  defaultTheme?: ThemeName;
  /** Default color mode when no stored preference exists */
  defaultMode?: ColorMode;
};

export function ThemeProvider({
  children,
  defaultTheme = 'merch-flow',
  defaultMode = 'system',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeName>(defaultTheme);
  const [mode, setModeState] = useState<ColorMode>(defaultMode);
  const [systemMode, setSystemMode] = useState<'light' | 'dark'>('light');

  // On mount: restore stored prefs, detect system mode
  useEffect(() => {
    const stored = readStoredPrefs();
    if (stored) {
      setThemeState(stored.theme);
      setModeState(stored.mode);
    }
    setSystemMode(getSystemMode());
  }, []);

  // Listen for OS-level scheme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) =>
      setSystemMode(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedMode: 'light' | 'dark' =
    mode === 'system' ? systemMode : mode;

  // Apply theme to <html> whenever it or the resolved mode changes
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', resolvedMode === 'dark');
  }, [theme, resolvedMode]);

  const setTheme = useCallback(
    (next: ThemeName) => {
      setThemeState(next);
      writeStoredPrefs({ theme: next, mode });
    },
    [mode],
  );

  const setMode = useCallback(
    (next: ColorMode) => {
      setModeState(next);
      writeStoredPrefs({ theme, mode: next });
    },
    [theme],
  );

  return (
    <ThemeContext.Provider
      value={{ theme, mode, setTheme, setMode, resolvedMode }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
}
