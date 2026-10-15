import { eq } from "drizzle-orm";
import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { getDb } from "@/lib/db.server";
import { user } from "@/lib/schema";

/**
 * Server-side session resolution via Clerk (server-only).
 *
 * Never trust a client-supplied user id — only `auth()` from Clerk.
 */

/** True when sign-in is on. Clerk may use env keys or keyless/dev credentials;
 * either way we resolve the user via `auth()` rather than a shared dev id.
 */
export const authConfigured = process.env.VITE_AUTH_ENABLED !== "false";

if (!authConfigured) {
  console.error(
    "[auth] Auth is disabled (VITE_AUTH_ENABLED=false) " +
      "— requireUserId() will reject every request (fail closed).",
  );
}

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
 *
 * Cost note: `auth()` above is cheap — `clerkMiddleware()` in `src/start.ts`
 * already verified the session for this request, so the SDK resolves from
 * request scope. The expensive parts were the `SELECT user` on *every*
 * server-function call plus a Clerk API fetch (`users.getUser`) on a miss.
 * `verifiedUserIds` memoizes ids already confirmed in this isolate, so the
 * steady state is zero extra DB round-trips per call.
 */
const verifiedUserIds = new Set<string>();

async function ensureLocalUser(userId: string): Promise<void> {
  if (verifiedUserIds.has(userId)) return;

  const db = await getDb();
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  if (existing.length > 0) {
    // Bound the set so a long-lived isolate can't grow it without limit.
    if (verifiedUserIds.size > 10_000) verifiedUserIds.clear();
    verifiedUserIds.add(userId);
    return;
  }

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
  // A concurrent first-boot for the same user may have won the insert race —
  // either way the row exists now.
  if (verifiedUserIds.size > 10_000) verifiedUserIds.clear();
  verifiedUserIds.add(userId);
}

/**
 * Resolve the current user id for a server function, or throw when unauthorized.
 * Prefer `authMiddleware` (`./middleware`), which calls this for you.
 */
export async function requireUserId(): Promise<string> {
  if (!authConfigured) {
    throw new Error(
      "Auth is disabled (VITE_AUTH_ENABLED=false) — " +
        "refusing to serve requests without sign-in.",
    );
  }
  // Session tokens only — the web cookie or a native app's
  // `Authorization: Bearer <session token>`. Clerk's middleware also parses
  // API keys / machine tokens; those never identify a library owner here.
  const session = await auth({ acceptsToken: "session_token" });
  if (!session.userId) throw new UnauthorizedError();
  await ensureLocalUser(session.userId);
  return session.userId;
}
