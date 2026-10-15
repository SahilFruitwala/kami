import { useCallback, useState } from "react";

/**
 * Per-device UI preferences in localStorage (view modes, collapsed panes).
 * Storage can be missing or throw (private mode, blocked site data), so every
 * access is guarded and a failed read falls back to the default.
 */

export function readLocal(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Store `value`, or remove the key when it is null. */
export function writeLocal(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/** `readLocal` narrowed to one of `allowed`, else `fallback`. */
export function readLocalChoice<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = readLocal(key);
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * `useState` for a string preference that persists per device. App pages are
 * client-rendered, so the stored value is read on first render (no flash),
 * and re-read when `key` changes (e.g. a per-tab key).
 */
export function usePersistedPref<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const [state, setState] = useState(() => ({
    key,
    value: readLocalChoice(key, allowed, fallback),
  }));
  let current = state;
  if (state.key !== key) {
    current = { key, value: readLocalChoice(key, allowed, fallback) };
    setState(current);
  }
  const set = useCallback(
    (next: T) => {
      setState({ key, value: next });
      writeLocal(key, next);
    },
    [key],
  );
  return [current.value, set];
}
