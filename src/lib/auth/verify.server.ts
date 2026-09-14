import { eq } from "drizzle-orm";
import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { getDb } from "@/lib/db";
import { user } from "@/lib/schema";

/**
 * Server-side session resolution via Clerk (server-only).
 *
 * Never trust a client-supplied user id — only `auth()` from Clerk.
 */

/** True when a real database is configured server-side. */
const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

/**
 * True when Clerk is configured (publishable + secret keys present).
 * Mirrors the old Better Auth `authConfigured` gate for fail-closed DB use.
 */
export const authConfigured =
  Boolean(process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()) &&
  Boolean(process.env.CLERK_SECRET_KEY?.trim()) &&
  process.env.VITE_AUTH_ENABLED !== "false";

if (databaseConfigured && !authConfigured) {
  console.error(
    "[auth] DATABASE_URL is set but Clerk keys are missing or auth is disabled " +
      "(VITE_AUTH_ENABLED=false) — requireUserId() will reject every request " +
      "(fail closed) rather than share one dev user on a real database.",
  );
}

/** Dev fallback user id, used only when auth is disabled (VITE_AUTH_ENABLED=false). */
export const DEV_USER_ID = "dev-user";

/**
 * Thrown by `requireUserId` when the caller has no valid session. Carries
 * `status: 401`; the message is a stable contract — match
 * `err.message === "Unauthorized"` client-side to send the visitor to sign-in.
 */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

/**
 * Ensure a local `user` row exists for FK'd library tables.
 * Clerk owns identity; we mirror the id so articles/folders can reference it.
 */
async function ensureLocalUser(userId: string): Promise<void> {
  const db = await getDb();
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (existing.length > 0) return;

  let name = "User";
  let email = `${userId}@users.clerk`;
  let image: string | null = null;

  try {
    const clerkUser = await clerkClient().users.getUser(userId);
    name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
      clerkUser.username ||
      "User";
    email = clerkUser.emailAddresses[0]?.emailAddress ?? email;
    image = clerkUser.imageUrl ?? null;
  } catch (err) {
    console.warn("[auth] could not fetch Clerk user for local upsert:", err);
  }

  const now = new Date();
  await db
    .insert(user)
    .values({
      id: userId,
      name,
      email,
      emailVerified: true,
      image,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

/**
 * Resolve the signed-in user from Clerk, or `null` when nobody is signed in /
 * auth isn't configured.
 */
export async function getSessionUser(): Promise<VerifiedUser | null> {
  if (!authConfigured) return null;
  const session = await auth();
  if (!session.userId) return null;
  return { id: session.userId, email: null };
}

/**
 * Resolve the current user id for a server function, or throw when unauthorized.
 * Prefer `authMiddleware` (`./middleware`), which calls this for you.
 */
export async function requireUserId(): Promise<string> {
  if (!authConfigured) {
    if (databaseConfigured) {
      throw new Error(
        "Auth is disabled or Clerk keys are missing but DATABASE_URL is set — " +
          "refusing to fall back to the shared dev user against a real database.",
      );
    }
    return DEV_USER_ID;
  }
  const session = await auth();
  if (!session.userId) throw new UnauthorizedError();
  await ensureLocalUser(session.userId);
  return session.userId;
}
