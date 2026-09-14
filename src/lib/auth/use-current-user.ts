import { useUser } from "@clerk/tanstack-react-start";
import { authEnabled } from "./client";

/** Normalized user shape used across the app, auth on or off. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  /** True when this is the sandbox/dev fallback (auth not configured). */
  isDevFallback: boolean;
};

/**
 * Stable fallback user, used ONLY when auth is disabled
 * (`VITE_AUTH_ENABLED=false`).
 */
export const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
};

/** `useCurrentUserState()` result: the user plus the session-loading flag. */
export type CurrentUserState = {
  /** The user — `null` BOTH while the session loads and when signed out. */
  user: AppUser | null;
  /** True while the session is still resolving — don't treat `user: null` as signed out yet. */
  isPending: boolean;
};

/**
 * Current user + loading state from Clerk.
 * Protect a route by waiting out `isPending` before acting on `user`.
 */
export function useCurrentUserState(): CurrentUserState {
  if (!authEnabled) return { user: DEV_USER, isPending: false };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- authEnabled is constant for the app's lifetime
  const { isLoaded, user } = useUser();
  return {
    user: user
      ? {
          id: user.id,
          displayName: user.fullName ?? user.username ?? null,
          primaryEmail: user.primaryEmailAddress?.emailAddress ?? null,
          profileImageUrl: user.imageUrl ?? null,
          isDevFallback: false,
        }
      : null,
    isPending: !isLoaded,
  };
}

/**
 * Convenience view of `useCurrentUserState().user` for display.
 * NOTE: `null` means *loading OR signed out* — for redirects/guards use
 * `useCurrentUserState()` and check `isPending`.
 */
export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
