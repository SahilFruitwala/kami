import "@tanstack/react-start/server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { EntrySummary, FeedDigest } from "@/lib/api/ai";
import { textFromHtml } from "@/lib/article-build.server.ts";
import { getDb } from "@/lib/db";
import { clipText } from "@/lib/model-fallback.ts";
import { feedEntries, feedSubscriptions, feeds } from "@/lib/schema";
import { asDocument, generateJson } from "@/server/ai";
import { badRequest, notFound } from "@/server/http";
import { userTagVocabulary } from "@/server/services/ai-articles";
import { getNote, saveNote } from "@/server/services/ai-notes";
import { listEntries } from "@/server/services/feeds";

/**
 * Feeds AI: a digest of unread entries (picks for this reader, topic groups
 * that fold several posts or newsletter issues into one summary, and
 * entries that are safe to skip), and per-entry summaries. Both are made on
 * demand and kept in `ai_notes`.
 */

const DIGEST_KIND = "feed-digest";
const ENTRY_KIND = "entry-summary";
const DIGEST_ENTRIES = 60;

export const digestInput = z.object({ feedId: z.string().max(200).optional() });
export const entryIdParams = z.object({ id: z.string().min(1).max(200) });

const digestKey = (feedId?: string) => feedId || "all";

/** A few lines describing what this reader cares about, from their own library. */
async function interestProfile(userId: string): Promise<string> {
  const db = await getDb();
  const [tags, recent] = await Promise.all([
    userTagVocabulary(userId, 20),
    db.execute<{ title: string }>(sql`
      select title from articles
      where user_id = ${userId}
        and (favorited or jsonb_array_length(highlights) > 0 or archived)
      order by saved_at desc limit 20`),
  ]);
  return [
    `Their tags: ${tags.length ? tags.join(", ") : "(none yet)"}`,
    "Pieces they recently finished, highlighted or favorited:",
    ...(recent.rows.length ? recent.rows.map((r) => `- ${r.title}`) : ["(none yet)"]),
  ].join("\n");
}

const digestSchema = z.object({
  overview: z.string().describe("Two or three sentences: what's in the pile right now."),
  picks: z
    .array(
      z.object({
        entry: z.string().describe("Entry id like e4."),
        why: z.string().describe("Half a sentence on why this reader would want it."),
      }),
    )
    .describe("Up to five entries this reader is most likely to value, best first."),
  topics: z
    .array(
      z.object({
        title: z.string().describe("Two to five words."),
        summary: z
          .string()
          .describe("One or two sentences that sum up what these entries say together."),
        entries: z.array(z.string()).describe("Ids of the entries in this topic."),
      }),
    )
    .describe("Up to six topics covering the notable entries; skip one-off noise."),
  skip: z
    .array(z.string())
    .describe("Ids of entries that are promotional, trivial or far from this reader's interests."),
});

export async function getFeedDigest(
  userId: string,
  { feedId }: z.output<typeof digestInput>,
): Promise<FeedDigest | null> {
  const note = await getNote<FeedDigest>(userId, DIGEST_KIND, digestKey(feedId));
  return note ? { ...note.content, model: note.model, createdAt: note.createdAt } : null;
}

export async function makeFeedDigest(
  userId: string,
  { feedId }: z.output<typeof digestInput>,
): Promise<FeedDigest> {
  const { entries } = await listEntries(userId, { view: "unread", feedId, limit: DIGEST_ENTRIES });
  if (entries.length < 2) throw badRequest("There's nothing unread to digest right now.");

  const idFor = new Map(entries.map((e, i) => [`e${i + 1}`, e]));
  const lines = entries.map(
    (e, i) =>
      `[e${i + 1}] ${e.title || "(untitled)"} — ${e.feedTitle}${e.feedKind === "email" ? " (newsletter)" : ""}${e.excerpt ? `: ${clipText(e.excerpt, 300)}` : ""}`,
  );
  const { output, model } = await generateJson(digestSchema, {
    instructions: [
      "You triage a reader's unread feed entries (blogs and email newsletters) into a short digest.",
      "Pick what this reader would value using their interests, group related entries into topics, and mark what is safe to skip.",
      "Refer to entries only by their ids (e1, e2…). Write plainly, in the language most entries are in.",
    ].join("\n"),
    prompt: [
      "About the reader:",
      asDocument(await interestProfile(userId)),
      "",
      "Unread entries:",
      asDocument(lines.join("\n")),
    ].join("\n"),
    maxOutputTokens: 1800,
  });

  const entry = (id: string) => idFor.get(id.replace(/[[\]\s]/g, ""));
  const ids = (list: string[]) => [
    ...new Set(list.map((id) => entry(id)?.id).filter((v): v is string => !!v)),
  ];
  const picks: FeedDigest["picks"] = [];
  for (const p of output.picks) {
    const e = entry(p.entry);
    if (!e || picks.some((x) => x.entryId === e.id)) continue;
    picks.push({ entryId: e.id, title: e.title, feedTitle: e.feedTitle, why: p.why.trim() });
    if (picks.length === 5) break;
  }
  const pickIds = new Set(picks.map((p) => p.entryId));
  const digest: Omit<FeedDigest, "model" | "createdAt"> = {
    feedId: feedId ?? null,
    entryCount: entries.length,
    overview: output.overview.trim(),
    picks,
    topics: output.topics
      .map((t) => ({
        title: t.title.trim(),
        summary: t.summary.trim(),
        entries: ids(t.entries).map((id) => {
          const e = entries.find((x) => x.id === id)!;
          return { entryId: id, title: e.title };
        }),
      }))
      .filter((t) => t.title && t.entries.length)
      .slice(0, 6),
    // Never suggest skipping a pick.
    skipIds: ids(output.skip).filter((id) => !pickIds.has(id)),
  };
  const note = await saveNote(userId, DIGEST_KIND, digestKey(feedId), digest, model, 50);
  return { ...digest, model: note.model, createdAt: note.createdAt };
}

// ---------- Entry summaries ----------

const entrySchema = z.object({
  tldr: z.string().describe("Two plain sentences: what the entry says."),
  keyPoints: z.array(z.string()).describe("Up to four short key points."),
});

const MIN_ENTRY_WORDS = 60;

export async function summarizeEntry(userId: string, entryId: string): Promise<EntrySummary> {
  const cached = await getNote<EntrySummary>(userId, ENTRY_KIND, entryId);
  if (cached) return cached.content;

  const db = await getDb();
  const [row] = await db
    .select({
      title: feedEntries.title,
      html: feedEntries.contentHtml,
      excerpt: feedEntries.excerpt,
      kind: feeds.kind,
      feedTitle: feeds.title,
    })
    .from(feedEntries)
    .innerJoin(feeds, eq(feeds.id, feedEntries.feedId))
    .innerJoin(
      feedSubscriptions,
      and(eq(feedSubscriptions.feedId, feedEntries.feedId), eq(feedSubscriptions.userId, userId)),
    )
    .where(eq(feedEntries.id, entryId))
    .limit(1);
  if (!row) throw notFound("Entry not found");
  const text = textFromHtml(row.html) || row.excerpt;
  if (text.split(/\s+/).length < MIN_ENTRY_WORDS) {
    throw badRequest("This entry only has a teaser. Open it to read the full piece.");
  }
  const { output, model } = await generateJson(entrySchema, {
    instructions: [
      "You summarise one feed entry for a reader deciding whether to read it.",
      row.kind === "email"
        ? "It is an email newsletter: ignore sponsor messages, ads, referral asks and footers."
        : "Ignore boilerplate such as share prompts and footers.",
      "Write in the entry's language.",
    ].join("\n"),
    prompt: asDocument(clipText(text, 16_000), { title: row.title, source: row.feedTitle }),
    maxOutputTokens: 500,
  });
  const summary: EntrySummary = {
    tldr: output.tldr.trim(),
    keyPoints: output.keyPoints
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 4),
  };
  await saveNote(userId, ENTRY_KIND, entryId, summary, model, 300);
  return summary;
}
