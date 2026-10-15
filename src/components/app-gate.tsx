import { useEffect } from "react";
import { Navigate } from "@tanstack/react-router";
import { useClearLibrarySession, useLibraryBoot } from "@/hooks/use-library-boot";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { errorMessage } from "@/lib/errors";

/**
 * Session gate shared by every app page. Auth-only: sends signed-out visitors
 * to login and renders children as soon as the session resolves. The library
 * boots in the background so pages that don't need it (Home capture) never
 * wait on it; pages that do opt in via <LibraryGate>.
 */
export function AppGate({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id;
  const clearSession = useClearLibrarySession();

  // Starts (or reuses) the per-user boot; never blocks this render.
  useLibraryBoot(isPending ? undefined : userId);

  useEffect(() => {
    if (!isPending && !userId) clearSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
 * Opt-in data gate for pages that read the library store: Library, Vault,
 * Reader. Shows the full-screen "Loading your library…" skeleton only there;
 * once booted for this user it renders straight away on every remount.
 */
export function LibraryGate({ children }: { children: React.ReactNode }) {
  const { user } = useCurrentUserState();
  const boot = useLibraryBoot(user?.id);

  if (!user) return <>{children}</>;

  if (boot.isError) {
    return (
      <GateLoading
        label={errorMessage(boot.error, "Could not load your library.")}
        actionLabel="Try again"
        onAction={() => void boot.refetch()}
      />
    );
  }

  if (!boot.isSuccess) {
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
