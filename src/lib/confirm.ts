/**
 * In-app replacement for `window.confirm`: `await confirmAction({...})`
 * resolves true when the reader confirms. One <ConfirmHost />
 * (`src/components/confirm-dialog.tsx`, mounted in the root layout) renders
 * whichever request is open.
 */

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Style the confirm button as a destructive action (default true). */
  destructive?: boolean;
};

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let current: Request | null = null;
let hostMounted = 0;
const listeners = new Set<() => void>();

function setCurrent(next: Request | null) {
  current = next;
  for (const fn of listeners) fn();
}

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (!hostMounted) {
    const text = options.description ? `${options.title}\n\n${options.description}` : options.title;
    return Promise.resolve(typeof window !== "undefined" && window.confirm(text));
  }
  // A new request supersedes one still open (treated as cancelled).
  current?.resolve(false);
  return new Promise((resolve) => setCurrent({ ...options, resolve }));
}

export function subscribeConfirm(fn: () => void) {
  listeners.add(fn);
  hostMounted += 1;
  return () => {
    listeners.delete(fn);
    hostMounted -= 1;
  };
}

export function settleConfirm(ok: boolean) {
  const req = current;
  if (!req) return;
  setCurrent(null);
  req.resolve(ok);
}

export function currentConfirm(): Readonly<ConfirmOptions> | null {
  return current;
}
