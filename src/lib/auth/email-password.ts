/**
 * Local email/password sign-in (this app's Better Auth DB — not the broker).
 *
 * Off by default. To enable: set `emailAndPasswordEnabled` to `true` below,
 * then build sign-up / sign-in forms with `authClient.signUp.email` /
 * `authClient.signIn.email` from `@/lib/auth/client` (see the auth skill).
 *
 * Enabling this also turns on `account.accountLinking.requireLocalEmailVerified`
 * in `server.ts`, so an unverified email/password signup cannot be linked to a
 * later Google/X sign-in for the same address (account-takeover guard). Full
 * email verification (send + confirm) is still a separate follow-up if you need
 * users to prove inbox ownership before using the password at all.
 *
 * Do NOT rewrite `server.ts` for this — flip this flag only.
 */
export const emailAndPasswordEnabled = true;
