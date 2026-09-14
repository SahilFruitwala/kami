/**
 * Client-side auth flags for Quarto + Clerk.
 *
 * Sign-in UI is shown whenever `VITE_AUTH_ENABLED` is not `"false"`.
 * Clerk keys (`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) must be set
 * in the environment for real sessions — see `.env.example`.
 */
export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";
