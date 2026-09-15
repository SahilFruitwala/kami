import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { BookMarked } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { SignInButtons, SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-4 text-sm text-ink-muted">
        <p role="status" aria-live="polite">Checking your session…</p>
      </main>
    );
  }

  if (user) {
    return <Navigate to="/" />;
  }

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-paper text-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-paper-warm)_75%,transparent),transparent)]"
      />
      <div className="relative mx-auto flex w-full max-w-md flex-col px-4 py-10 sm:px-6">
        <div className="mb-10 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
            <span className="flex size-8 items-center justify-center rounded-md bg-ink text-paper">
              <BookMarked className="size-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tracking-tight" translate="no">KAMI</span>
          </Link>
          <ThemeToggle />
        </div>

        <SignedOut>
          <h1 className="font-display text-3xl leading-tight tracking-tight">Sign in to <span translate="no">KAMI</span></h1>
          <p className="mt-3 text-base leading-normal text-ink-soft">
            Your reading list stays with your account — save from any device, keep tags and
            highlights in sync.
          </p>
          <div className="mt-8">
            <SignInButtons />
          </div>
          <p className="mt-6 text-xs text-ink-muted">
            Sign in or create an account with Clerk. Your library stays private to this app.
          </p>
        </SignedOut>

        <SignedIn>
          <Navigate to="/" />
        </SignedIn>
      </div>
    </main>
  );
}
