import "@tanstack/react-start/server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { WeeklyRecap } from "@/lib/api/ai";
import { highlightLine } from "@/lib/ai-text.ts";
import { getDb } from "@/lib/db";
import { asDocument, generateJson } from "@/server/ai";
import { badRequest } from "@/server/http";
import { latestNote, saveNote } from "@/server/services/ai-notes";

/**
 * "Your week in reading": a short recap of the past seven days — what was
 * saved and finished, the passages highlighted — with a reflection prompt
 * and a pick from the unread inbox. Made on demand from the desk and kept
 * in `ai_notes` (kind `weekly-recap`, keyed by the day it was made).
 */

const KIND = "weekly-recap";
const DAY_MS = 86_400_000;

const recapSchema = z.object({
  recap: z.string().describe("Three or four sentences in second person about the week's reading."),
  themes: z.array(z.string()).describe("Up to four short themes (two to four words each)."),
  standout: z
    .string()
    .nullable()
    .describe("Id (h1, h2…) of the most striking highlight, or null when there are none."),
  prompt: z.string().describe("One open reflection question drawn from the week's reading."),
  nextRead: z
    .string()
    .nullable()
    .describe("Id (r1, r2…) of the unread piece that best follows this week, or null."),
  nextReason: z
    .string()
    .describe("Half a sentence on why that piece is a good next read, or empty."),
});

type ArticleRow = {
  id: string;
  title: string;
  site: string;
  excerpt: string;
  minutes: number;
  archived: boolean;
};
type HighlightRow = { article_id: string; title: string; text: string; note: string | null };

export async function getWeeklyRecap(userId: string): Promise<WeeklyRecap | null> {
  const note = await latestNote<WeeklyRecap>(userId, KIND);
  return note ? { ...note.content, model: note.model, createdAt: note.createdAt } : null;
}

export async function makeWeeklyRecap(userId: string): Promise<WeeklyRecap> {
  const now = Date.now();
  const since = new Date(now - 7 * DAY_MS);
  const db = await getDb();
  const [saved, highlights, unread] = await Promise.all([
    db.execute<ArticleRow>(sql`
      select id, title, site_name as site, excerpt, reading_minutes as minutes, archived
      from articles where user_id = ${userId} and saved_at >= ${since}
      order by saved_at desc limit 40`),
    db.execute<HighlightRow>(sql`
      select a.id as article_id, a.title, h->>'text' as text, h->>'note' as note
      from articles a, jsonb_array_elements(a.highlights) h
      where a.user_id = ${userId}
        and (h->>'createdAt') ~ '^[0-9]+$' and (h->>'createdAt')::bigint >= ${since.getTime()}
      order by (h->>'createdAt')::bigint desc limit 40`),
    db.execute<ArticleRow>(sql`
      select id, title, site_name as site, excerpt, reading_minutes as minutes, archived
      from articles
      where user_id = ${userId} and not archived and saved_at < ${since}
        and jsonb_array_length(highlights) = 0
      order by saved_at desc limit 20`),
  ]);
  if (!saved.rows.length && !highlights.rows.length) {
    throw badRequest("Nothing was saved or highlighted in the past week yet.");
  }

  const line = (a: ArticleRow) =>
    `${a.title}${a.site ? ` (${a.site})` : ""}, ${a.minutes} min${a.archived ? ", finished" : ""}${a.excerpt ? `: ${a.excerpt.slice(0, 200)}` : ""}`;
  const prompt = [
    "Saved this week:",
    asDocument(saved.rows.map((a) => `- ${line(a)}`).join("\n") || "(nothing)"),
    "",
    "Highlighted this week:",
    asDocument(
      highlights.rows
        .map(
          (h, i) =>
            `[h${i + 1}] ${highlightLine({ text: h.text, note: h.note ?? "" })} — ${h.title}`,
        )
        .join("\n") || "(nothing)",
    ),
    "",
    "Unread from earlier:",
    asDocument(unread.rows.map((a, i) => `[r${i + 1}] ${line(a)}`).join("\n") || "(nothing)"),
  ].join("\n");

  const { output, model } = await generateJson(recapSchema, {
    instructions: [
      "You write a warm, specific weekly recap for someone's personal reading library.",
      "Name actual pieces and ideas; no generic praise, no statistics the reader can already see.",
      "Refer to highlights only by their ids (h1…) and unread pieces only by theirs (r1…).",
      "Write in the language most of the reading is in.",
    ].join("\n"),
    prompt,
    maxOutputTokens: 900,
    temperature: 0.5,
  });

  const pick = <T>(rows: T[], id: string | null, prefix: string): T | undefined => {
    const n = Number(id?.replace(/[[\]\s]/g, "").replace(prefix, ""));
    return Number.isInteger(n) && n >= 1 ? rows[n - 1] : undefined;
  };
  const standout = pick(highlights.rows, output.standout, "h");
  const next = pick(unread.rows, output.nextRead, "r");

  const recap: Omit<WeeklyRecap, "model" | "createdAt"> = {
    from: since.toISOString().slice(0, 10),
    to: new Date(now).toISOString().slice(0, 10),
    stats: {
      saved: saved.rows.length,
      finished: saved.rows.filter((a) => a.archived).length,
      highlights: highlights.rows.length,
    },
    recap: output.recap.trim(),
    themes: output.themes
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 4),
    standout: standout
      ? { text: standout.text, articleId: standout.article_id, title: standout.title }
      : null,
    prompt: output.prompt.trim(),
    nextRead: next
      ? { articleId: next.id, title: next.title, reason: output.nextReason.trim() }
      : null,
  };
  const note = await saveNote(userId, KIND, recap.to, recap, model);
  return { ...recap, model: note.model, createdAt: note.createdAt };
}
