import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { SignUp } from "@clerk/tanstack-react-start";
import { KAMI_GLYPH } from "@/components/kami.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

/**
 * Catch-all under `/sign-up` for Clerk path steps (`/sign-up/verify-email-address`,
 * etc.). Kept separate from `/login` so multi-step signup does not lose `mode`
 * and fall back to the sign-in component.
 */
export const Route = createFileRoute("/sign-up/$")({
  component: SignUpPage,
});

function SignUpPage() {
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-4 text-sm text-ink-muted">
        <p role="status" aria-live="polite">
          Checking your session…
        </p>
      </main>
    );
  }

  if (user) {
    return <Navigate to="/app" />;
  }

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-paper text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72" />
      <div className="relative mx-auto flex w-full max-w-md flex-col px-4 py-10 sm:px-6">
        <div className="mb-10 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
          >
            <span
              className="kami-hanko flex size-7 items-center justify-center rounded-full font-display text-sm leading-none"
              lang="ja"
            >
              {KAMI_GLYPH}
            </span>
            <span className="font-display text-[22px] leading-none tracking-tight" translate="no">
              Kami
            </span>
          </Link>
          <ThemeToggle />
        </div>

        <h1 className="font-display text-5xl leading-none font-normal tracking-tight">
          Begin with <span translate="no">Kami</span>
        </h1>
        <p className="mt-4 font-display text-lg leading-snug text-ink-soft">
          Your reading list stays with your account — save from any device, keep tags and highlights
          in sync.
        </p>
        <div className="mt-8 flex justify-center">
          <SignUp path="/sign-up" signInUrl="/login" fallbackRedirectUrl="/app" />
        </div>
        <p className="mt-6 text-xs text-ink-muted">
          Sign in or create an account with Clerk. Your library stays private to this app.
        </p>
      </div>
    </main>
  );
}
