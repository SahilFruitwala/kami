import "@tanstack/react-start/server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ShelfRec } from "@/lib/api/ai";
import type { LookupResult } from "@/lib/api/types";
import { getDb } from "@/lib/db";
import { normalizeTitle } from "@/lib/shelves-db.server.ts";
import { asDocument, generateJson } from "@/server/ai";
import { badRequest } from "@/server/http";
import { searchBooks, searchTmdb } from "@/server/services/lookup";

/**
 * Shelf recommendations: suggest movies, shows or books from what is
 * already on the shelf (finished, in progress, abandoned, queued), then
 * match each suggestion against TMDB / Open Library so it can be added in
 * one tap with a cover and metadata. Nothing is stored.
 */

export const recommendInput = z.object({ type: z.enum(["movie", "tv", "book"]) });
type RecType = z.output<typeof recommendInput>["type"];

const MIN_ITEMS = 3;
const MAX_ITEMS = 150;
const WANT = 8;

const NOUN: Record<RecType, string> = { movie: "movies", tv: "TV shows", book: "books" };
const STATUS: Record<string, string> = {
  done: "finished",
  in_progress: "in progress",
  abandoned: "gave up",
  to_try: "want to",
};

type Row = { title: string; status: string; year: number | null; author: string | null };

async function shelfItems(userId: string, type: RecType): Promise<Row[]> {
  const db = await getDb();
  const table = type === "movie" ? sql`movies` : type === "tv" ? sql`tv_shows` : sql`books`;
  const year =
    type === "book"
      ? sql`t.publish_year as year, t.author`
      : sql`t.release_year as year, null as author`;
  const result = await db.execute<Row>(sql`
    select t.title, t.status, ${year}
    from ${table} t join lists l on l.id = t.list_id
    where l.owner_id = ${userId}
    order by (t.status = 'done') desc, coalesce(t.completed_at, t.created_at) desc
    limit ${MAX_ITEMS}`);
  return result.rows;
}

const recSchema = z.object({
  recs: z
    .array(
      z.object({
        title: z.string().describe("Exact title as published."),
        year: z.number().int().nullable().describe("Release or publication year, if known."),
        creator: z.string().nullable().describe("Director, showrunner or author, if known."),
        why: z.string().describe("One sentence tying it to specific things on their shelf."),
      }),
    )
    .describe("Ten suggestions, best first, none already on the shelf."),
});

/** Titles match when equal after normalising, ignoring a subtitle and a leading "The". */
const titleKey = (title: string) =>
  normalizeTitle(title.split(/[:(]/)[0]).replace(/^(the|a|an) /, "");
const sameTitle = (a: string, b: string) => titleKey(a) === titleKey(b);

async function lookup(type: RecType, title: string, creator: string | null) {
  try {
    const results: LookupResult[] =
      type === "book"
        ? await searchBooks({ q: [title, creator].filter(Boolean).join(" ") })
        : await searchTmdb({ q: title, kind: type });
    return results.find((r) => sameTitle(r.title, title)) ?? null;
  } catch {
    return null;
  }
}

export async function recommendShelf(
  userId: string,
  { type }: z.output<typeof recommendInput>,
): Promise<{ recs: ShelfRec[] }> {
  const items = await shelfItems(userId, type);
  if (items.length < MIN_ITEMS) {
    throw badRequest(
      `Add a few ${NOUN[type]} to this shelf first, so suggestions have something to go on.`,
    );
  }
  const lines = items.map(
    (r) =>
      `- ${r.title}${r.year ? ` (${r.year})` : ""}${r.author ? ` by ${r.author}` : ""}: ${STATUS[r.status] ?? r.status}`,
  );
  const { output } = await generateJson(recSchema, {
    instructions: [
      `You recommend ${NOUN[type]} for one person based on their shelf.`,
      "Finished items show taste; 'gave up' ones show what to avoid; 'want to' ones are already queued, so don't repeat them.",
      "Prefer real, well-known enough titles you are sure exist. Mix safe bets with one or two less obvious picks.",
      "Each reason must name something specific from their shelf.",
    ].join("\n"),
    prompt: asDocument(lines.join("\n")),
    maxOutputTokens: 1400,
    temperature: 0.7,
  });

  const owned = items.map((r) => r.title);
  const fresh = output.recs.filter(
    (r) => r.title.trim() && !owned.some((t) => sameTitle(t, r.title)),
  );
  const unique = fresh.filter((r, i) => fresh.findIndex((x) => sameTitle(x.title, r.title)) === i);
  const picked = unique.slice(0, WANT);
  const matches = await Promise.all(picked.map((r) => lookup(type, r.title, r.creator)));
  return {
    recs: picked.map((r, i) => ({
      title: matches[i]?.title ?? r.title.trim(),
      subtitle: [r.year, r.creator].filter(Boolean).join(" · ") || null,
      why: r.why.trim(),
      match: matches[i],
    })),
  };
}
