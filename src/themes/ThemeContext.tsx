import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type AppTheme = 'cyberfiles' | 'gray' | 'light';

interface ThemeContextValue {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
}

const STORAGE_KEY = 'cyberfiles_theme';
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isAppTheme(value: unknown): value is AppTheme {
  return value === 'cyberfiles' || value === 'gray' || value === 'light';
}

function getInitialTheme(): AppTheme {
  const earlyTheme = document.documentElement.dataset.theme;
  if (isAppTheme(earlyTheme)) return earlyTheme;

  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    if (isAppTheme(storedTheme)) return storedTheme;
  } catch {
    // Browser privacy settings can disable local storage. The default remains usable.
  }

  return 'cyberfiles';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Persisting a preference is optional and must not prevent theme changes.
    }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
