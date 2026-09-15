import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';

// ─── Types ──────────────────────────────────────────────────

export type Theme = 'light' | 'dark';

export type PositionOrEvent =
  | { clientX?: number; clientY?: number; x?: number; y?: number }
  | ReactMouseEvent
  | MouseEvent;

interface ThemeContextType {
  theme: Theme;
  toggleTheme: (origin?: PositionOrEvent) => void;
  setTheme: (theme: Theme, origin?: PositionOrEvent) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// ─── Storage Key ────────────────────────────────────────────

const THEME_KEY = 'heliflow_theme';

// ─── Helpers ────────────────────────────────────────────────

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage unavailable
  }
  return null;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// ─── Provider ───────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    return getStoredTheme() || getSystemTheme();
  });

  // Apply theme to DOM on mount
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system theme changes (if no stored preference)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const handler = (e: MediaQueryListEvent) => {
      if (!getStoredTheme()) {
        const newTheme = e.matches ? 'dark' : 'light';
        setThemeState(newTheme);
        applyTheme(newTheme);
      }
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((newTheme: Theme, origin?: PositionOrEvent) => {
    const isDarkNext = newTheme === 'dark';

    const supportsViewTransitions =
      typeof document !== 'undefined' &&
      'startViewTransition' in document &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!supportsViewTransitions) {
      setThemeState(newTheme);
      applyTheme(newTheme);
      try {
        localStorage.setItem(THEME_KEY, newTheme);
      } catch {}
      return;
    }

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    if (origin) {
      if ('clientX' in origin && typeof origin.clientX === 'number') {
        x = origin.clientX;
      } else if ('x' in origin && typeof origin.x === 'number') {
        x = origin.x;
      }

      if ('clientY' in origin && typeof origin.clientY === 'number') {
        y = origin.clientY;
      } else if ('y' in origin && typeof origin.y === 'number') {
        y = origin.y;
      }
    }

    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = (document as any).startViewTransition(() => {
      setThemeState(newTheme);
      applyTheme(newTheme);
      try {
        localStorage.setItem(THEME_KEY, newTheme);
      } catch {}
    });

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];

      document.documentElement.animate(
        {
          clipPath,
        },
        {
          duration: 450,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    });
  }, []);

  const toggleTheme = useCallback((origin?: PositionOrEvent) => {
    setTheme(theme === 'dark' ? 'light' : 'dark', origin);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme,
        isDark: theme === 'dark',
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
