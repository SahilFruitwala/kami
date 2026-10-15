import { useEffect } from "react";
import { create } from "zustand";
import { combine } from "zustand/middleware";
import { isPaperTone } from "@/lib/paper-tones.ts";
import { readLocal, writeLocal } from "@/lib/local-pref.ts";
import { useReaderPrefs } from "@/lib/reader-prefs.ts";

export type Theme = "light" | "dark";

const STORAGE_KEY = "quarto-theme";

function getSystemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(): Theme | null {
  const stored = readLocal(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
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
  followSystem: () => void;
  toggleTheme: () => void;
};

/**
 * Keep the article reading sheet in step with the global theme: dark mode
 * inks the sheet to Sumi, light mode restores the reader's preferred light
 * paper (Pale/Aged). A manual paper pick still wins until the next toggle.
 */
export function syncReaderPaper(theme: Theme) {
  try {
    const prefs = useReaderPrefs.getState();
    if (theme === "dark") {
      if (prefs.paperTone !== "sumi") prefs.setPaperTone("sumi");
    } else if (prefs.paperTone === "sumi") {
      const light = prefs.preferredLightTone;
      prefs.setPaperTone(isPaperTone(light) && light !== "sumi" ? light : "pale");
    }
  } catch {
    // prefs store unavailable (SSR) — nothing to sync
  }
}

export const useThemeStore = create<ThemeState>()(
  combine(
    {
      theme:
        typeof window === "undefined" ? ("light" as Theme) : (getStoredTheme() ?? getSystemTheme()),
      isSystem: typeof window === "undefined" ? true : getStoredTheme() == null,
    },
    (set, get) => ({
      setTheme: (next: Theme) => {
        writeLocal(STORAGE_KEY, next);
        applyTheme(next);
        set({ theme: next, isSystem: false });
        syncReaderPaper(next);
      },
      toggleTheme: () => {
        const next: Theme = get().theme === "dark" ? "light" : "dark";
        writeLocal(STORAGE_KEY, next);
        applyTheme(next);
        set({ theme: next, isSystem: false });
        syncReaderPaper(next);
      },
      followSystem: () => {
        writeLocal(STORAGE_KEY, null);
        const next = getSystemTheme();
        applyTheme(next);
        set({ theme: next, isSystem: true });
        syncReaderPaper(next);
      },
    }),
  ),
);

/** Applies the theme class + follows OS changes until the user picks explicitly. */
export function useTheme() {
  const theme = useThemeStore((s) => s.theme);
  const isSystem = useThemeStore((s) => s.isSystem);
  const setTheme = useThemeStore((s) => s.setTheme);
  const followSystem = useThemeStore((s) => s.followSystem);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  useEffect(() => {
    applyTheme(useThemeStore.getState().theme);
    syncReaderPaper(useThemeStore.getState().theme);
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
      syncReaderPaper(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [isSystem]);

  return { theme, isSystem, setTheme, followSystem, toggleTheme };
}
