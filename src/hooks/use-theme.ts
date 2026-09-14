import { useEffect } from "react";
import { create } from "zustand";
import { combine } from "zustand/middleware";

export type Theme = "light" | "dark";

const STORAGE_KEY = "quarto-theme";

function getSystemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // ignore (private mode, SSR)
  }
  return null;
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

type ThemeState = {
  theme: Theme;
  isSystem: boolean;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
};

export const useThemeStore = create<ThemeState>()(
  combine(
    {
      theme: typeof window === "undefined" ? ("light" as Theme) : (getStoredTheme() ?? getSystemTheme()),
      isSystem: typeof window === "undefined" ? true : getStoredTheme() == null,
    },
    (set) => ({
      setTheme: (next: Theme) => {
        try {
          window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // ignore
        }
        applyTheme(next);
        set({ theme: next, isSystem: false });
      },
      toggleTheme: () => {
        set((state) => {
          const next: Theme = state.theme === "dark" ? "light" : "dark";
          try {
            window.localStorage.setItem(STORAGE_KEY, next);
          } catch {
            // ignore
          }
          applyTheme(next);
          return { theme: next, isSystem: false };
        });
      },
    }),
  ),
);

/** Applies the theme class + follows OS changes until the user picks explicitly. */
export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const isSystem = useThemeStore((s) => s.isSystem);
  const setTheme = useThemeStore((s) => s.setTheme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  useEffect(() => {
    applyTheme(useThemeStore.getState().theme);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!isSystem) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? "dark" : "light";
      useThemeStore.setState({ theme: next });
      applyTheme(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [isSystem]);

  return { theme, isSystem, setTheme, toggleTheme };
}
