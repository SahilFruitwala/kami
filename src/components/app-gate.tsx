import { useEffect, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  bootstrapLibraryFromServer,
  clearLibraryLocal,
  isLibraryBootstrapped,
} from "@/lib/library-remote";
import { errorMessage } from "@/lib/errors";

/**
 * Session gate shared by every app page. Auth-only: sends signed-out visitors
 * to login and renders children as soon as the session resolves. The library
 * boots in the background (fire-and-forget) so pages that don't need it —
 * e.g. Home capture — never block on `getLibrary`. Pages that DO need the
 * library opt in via <LibraryGate>.
 */
export function AppGate({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;

  // Kick off the library boot without blocking first paint. Pages behind
  // <LibraryGate> await it locally; everyone else renders immediately and
  // picks up store rows when they land. `bootstrapLibraryFromServer` is
  // guarded per-user + dedupes inflight calls, so this is safe to fire from
  // every remount.
  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      clearLibraryLocal();
      return;
    }
    if (isLibraryBootstrapped(userId)) return;
    void bootstrapLibraryFromServer(userId).catch(() => undefined);
  }, [userId, isPending]);

  if (isPending) {
    return <GateLoading label="Checking your session…" />;
  }

  if (!user) {
    return <Navigate to="/login/$" />;
  }

  return <>{children}</>;
}

/**
 * Opt-in data gate for pages that read `useLibraryStore().library`:
 * Library, Vault, Reader. Shows the full-screen "Loading your library…"
 * skeleton only there — Home / Shelves / Settings render without waiting.
 */
export function LibraryGate({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUserState();
  const userId = user?.id;
  // Per-mount ready flag (see AppGate history): remounts must not flash the
  // skeleton when the store is already booted for this user.
  const [readyForUser, setReadyForUser] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const libraryReady =
    Boolean(userId && isLibraryBootstrapped(userId)) || Boolean(userId && readyForUser === userId);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    if (isLibraryBootstrapped(userId)) {
      setReadyForUser(userId);
      setLibraryError(null);
      return;
    }
    setLibraryError(null);
    void bootstrapLibraryFromServer(userId)
      .then(() => {
        if (!cancelled) setReadyForUser(userId);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = errorMessage(error, "Could not load your library.");
        setLibraryError(message);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return <>{children}</>;

  if (libraryError) {
    return (
      <GateLoading
        label={libraryError}
        actionLabel="Try again"
        onAction={() => {
          setLibraryError(null);
          setReadyForUser(null);
          if (!userId) return;
          void bootstrapLibraryFromServer(userId)
            .then(() => setReadyForUser(userId))
            .catch((error: unknown) => {
              const message = errorMessage(error, "Could not load your library.");
              setLibraryError(message);
            });
        }}
      />
    );
  }

  if (!libraryReady) {
    return <GateLoading label="Loading your library…" />;
  }

  return <>{children}</>;
}

function GateLoading({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const isError = Boolean(actionLabel && onAction);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6 text-ink">
      <div
        className="flex w-full max-w-sm flex-col items-center gap-4 text-center"
        role={isError ? "alert" : "status"}
        aria-live="polite"
      >
        <p className="font-display text-2xl tracking-tight">Kami</p>
        {!isError ? (
          <div className="flex w-full flex-col gap-2.5" aria-hidden="true">
            <div className="h-11 animate-pulse rounded-md bg-paper-warm" />
            <div className="h-4 w-2/3 animate-pulse self-center rounded-full bg-paper-warm" />
            <div className="h-16 animate-pulse rounded-xl bg-paper-warm" />
          </div>
        ) : null}
        <p className="text-sm text-ink-muted">{label}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="h-11 rounded-full bg-hanko px-5 text-sm font-medium text-paper transition hover:bg-shu focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </main>
  );
}
