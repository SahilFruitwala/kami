import "@tanstack/react-start/server-only";
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  emailToEntry,
  normalizeInbound,
  tokenFromRecipients,
} from "@/lib/newsletter-parse.server.ts";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit.server.ts";
import { feedSubscriptions, feeds, newsletterInboxes } from "@/lib/schema";
import { uid } from "@/lib/id";
import { HttpError } from "@/server/http";
import { insertEntries } from "./poller";

/**
 * Email newsletters → a private feed per sender.
 *
 * Each user gets one secret address `<token>@INBOUND_EMAIL_DOMAIN`. An inbound
 * mail provider (Postmark inbound, or a Cloudflare Email Worker — see
 * docs/ARCHITECTURE.md) POSTs each message to `/api/hooks/inbound-email`; the message
 * becomes an entry in a feed owned by that user, named after the sender. No
 * polling is involved: newsletters cost nothing until they arrive.
 */

export const INBOUND_MAX_BYTES = 5_000_000;

export function inboundDomain(): string | null {
  const domain = process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase();
  return domain || null;
}

export function newInboxToken(): string {
  // 12 base-36 chars ≈ 62 bits: unguessable, still easy to read aloud.
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

/** Store one inbound message for the user its address belongs to. */
export async function ingestInboundEmail(payload: unknown): Promise<{ stored: boolean }> {
  const domain = inboundDomain();
  if (!domain) throw new HttpError(503, "Inbound email is not configured.");
  const mail = normalizeInbound(payload);
  if (!mail) throw new HttpError(400, "Unrecognized inbound email payload.");
  const token = tokenFromRecipients(mail.recipients, domain);
  // Unknown recipients are acknowledged (2xx) so the provider doesn't retry
  // forever, but nothing is stored.
  if (!token || !mail.fromEmail) return { stored: false };

  const db = await getDb();
  const inbox = (
    await db
      .select({ userId: newsletterInboxes.userId })
      .from(newsletterInboxes)
      .where(eq(newsletterInboxes.token, token))
      .limit(1)
  )[0];
  if (!inbox) return { stored: false };
  const userId = inbox.userId;
  try {
    await enforceRateLimit(userId, "inbound");
  } catch (err) {
    // Ack and drop: a 429 would only make the provider retry the flood.
    if (err instanceof RateLimitError) return { stored: false };
    throw err;
  }

  const feedUrl = `email:${userId}:${mail.fromEmail}`;
  const title = (mail.fromName || mail.fromEmail).slice(0, 200);
  await db
    .insert(feeds)
    .values({ id: uid(), kind: "email", url: feedUrl, ownerId: userId, title, siteUrl: null })
    .onConflictDoNothing({ target: feeds.url });
  const feed = (
    await db
      .select({ id: feeds.id, title: feeds.title })
      .from(feeds)
      .where(and(eq(feeds.url, feedUrl), eq(feeds.ownerId, userId)))
      .limit(1)
  )[0];
  if (!feed) return { stored: false };
  if (!feed.title && title) {
    await db.update(feeds).set({ title }).where(eq(feeds.id, feed.id));
  }
  // Removing a sender deletes its feed; a later issue starts a fresh one.
  await db.insert(feedSubscriptions).values({ userId, feedId: feed.id }).onConflictDoNothing();

  const fresh = await insertEntries(db, feed.id, [emailToEntry(mail)]);
  if (fresh > 0) {
    await db
      .update(feeds)
      .set({ lastFetchedAt: sql`now()`, lastNewEntryAt: sql`now()` })
      .where(eq(feeds.id, feed.id));
  }
  return { stored: fresh > 0 };
}
