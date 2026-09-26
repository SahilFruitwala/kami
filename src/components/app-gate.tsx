import { useEffect, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  bootstrapJournalFromServer,
  clearJournalLocal,
  isJournalBootstrapped,
} from "@/lib/journal-remote";
import {
  bootstrapLibraryFromServer,
  clearLibraryLocal,
  isLibraryBootstrapped,
} from "@/lib/library-remote";

/**
 * Session + library bootstrap shell shared by every app page.
 * Sends signed-out visitors to login, renders a loading state while the
 * library syncs, and shows children once the page can render real data.
 */
export function AppGate({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  // Track which userId a successful bootstrap completed for. Every pane
  // remounts AppGate; defaulting ready to false flashed the full-screen
  // "Loading your library…" shell after ⌘K save → /read even when the
  // library was already in memory for this user.
  const [readyForUser, setReadyForUser] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const libraryReady =
    Boolean(
      userId && isLibraryBootstrapped(userId) && isJournalBootstrapped(userId),
    ) || Boolean(userId && readyForUser === userId);

  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      clearLibraryLocal();
      clearJournalLocal();
      setReadyForUser(null);
      setLibraryError(null);
      return;
    }

    let cancelled = false;
    // Already synced for this user (e.g. navigating between panes remounts
    // the gate) — skip the network round-trip.
    if (isLibraryBootstrapped(userId) && isJournalBootstrapped(userId)) {
      setReadyForUser(userId);
      setLibraryError(null);
      return;
    }
    setLibraryError(null);

    void bootstrapAppData(userId)
      .then(() => {
        if (!cancelled) setReadyForUser(userId);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Could not load your library.";
        setLibraryError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, isPending]);

  if (isPending) {
    return <GateLoading label="Checking your session…" />;
  }

  if (!user) {
    return <Navigate to="/login/$" />;
  }

  if (libraryError) {
    return (
      <GateLoading
        label={libraryError}
        actionLabel="Try again"
        onAction={() => {
          setLibraryError(null);
          setReadyForUser(null);
          if (!userId) return;
          void bootstrapAppData(userId)
            .then(() => setReadyForUser(userId))
            .catch((error: unknown) => {
              const message =
                error instanceof Error
                  ? error.message
                  : "Could not load your library.";
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

async function bootstrapAppData(userId: string): Promise<void> {
  await Promise.all([
    isLibraryBootstrapped(userId)
      ? Promise.resolve()
      : bootstrapLibraryFromServer(userId),
    isJournalBootstrapped(userId)
      ? Promise.resolve()
      : bootstrapJournalFromServer(userId),
  ]);
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
            className="h-11 rounded-full bg-hanko px-5 text-sm font-medium text-white transition hover:bg-shu focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </main>
  );
}
