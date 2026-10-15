import "@tanstack/react-start/server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { EntrySummary } from "@/lib/api/ai";
import { textFromHtml } from "@/lib/article-build.server.ts";
import { getDb } from "@/lib/db.server";
import { clipText } from "@/lib/model-fallback.ts";
import { feedEntries, feedSubscriptions, feeds } from "@/lib/schema";
import { asDocument, generateJson } from "@/server/ai";
import { badRequest, notFound } from "@/server/http";
import { getNote, saveNote } from "@/server/services/ai-notes";

/** Feeds AI: a per-entry summary, made on demand and kept in `ai_notes`. */

const ENTRY_KIND = "entry-summary";
export const entryIdParams = z.object({ id: z.string().min(1).max(200) });

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
