import type { ReactNode } from "react";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton as ClerkUserButton,
} from "@clerk/tanstack-react-start";
import { Navigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "./use-current-user";

/** Where `RedirectToSignIn` sends signed-out visitors. */
export const SIGN_IN_PATH = "/login";

/** Render children only when a Clerk user is signed in. */
export function SignedIn({ children }: { children: ReactNode }) {
  return <Show when="signed-in">{children}</Show>;
}

/** Render children only when signed out (hidden while Clerk is still loading). */
export function SignedOut({ children }: { children: ReactNode }) {
  return <Show when="signed-out">{children}</Show>;
}

/**
 * Client-side redirect to the sign-in route (TanStack `<Navigate>` — NOT a full
 * `window.location` reload).
 */
export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

export function SignInGate({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return null;
  if (user) return <>{children}</>;
  return <>{fallback ?? <SignInButtons />}</>;
}

/** Sign-in / sign-up actions for signed-out visitors. */
export function SignInButtons() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <SignInButton mode="modal">
        <Button type="button" className="w-full">
          Sign in
        </Button>
      </SignInButton>
      <SignUpButton mode="modal">
        <Button type="button" variant="outline" className="w-full">
          Create account
        </Button>
      </SignUpButton>
    </div>
  );
}

/** Clerk account menu for the signed-in user. */
export function UserButton() {
  return (
    <Show when="signed-in">
      <ClerkUserButton
        appearance={{
          elements: {
            avatarBox: "size-8",
          },
        }}
      />
    </Show>
  );
}

export { Show, SignInButton, SignUpButton };
