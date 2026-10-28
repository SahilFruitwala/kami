import { createHash } from "node:crypto";
import { PAIN_WORDS } from "./discover.ts";
import { chunkMarkdown } from "./sources.ts";

/**
 * Pure helpers for turning pages into evidence: which parts of a page are
 * worth sending to the model, and tidying what the model says about each
 * quote (product names, author, date). Tested in
 * tests/research-evidence.test.mjs.
 */

/** Characters per page chunk; a comment or review usually fits whole. */
export const CHUNK_CHARS = 3_000;
/** Most chunks of one page sent to extraction _(start value)_. */
export const MAX_CHUNKS_PER_PAGE = 5;

/** Words of the seed worth looking for in a chunk (4+ letters, not filler). */
function seedTerms(seed: string): string[] {
  const filler = new Set([
    "tools",
    "tool",
    "people",
    "with",
    "that",
    "this",
    "from",
    "your",
    "their",
  ]);
  return [...new Set(seed.toLowerCase().match(/\p{L}{4,}/gu) ?? [])].filter((w) => !filler.has(w));
}

/**
 * The parts of a page worth extracting from: chunks that mention the seed or
 * sound like someone describing a problem, the best `MAX_CHUNKS_PER_PAGE`,
 * kept in page order. A short page that never trips the filter still sends
 * its first chunk, so a terse review isn't lost.
 */
export function selectChunks(markdown: string, seed: string): string[] {
  const chunks = chunkMarkdown(markdown, CHUNK_CHARS);
  const terms = seedTerms(seed);
  const scored = chunks.map((text, order) => {
    const lower = text.toLowerCase();
    const pain = (text.match(PAIN_WORDS) ?? []).length;
    const topical = terms.filter((t) => lower.includes(t)).length;
    return { text, order, score: pain + 2 * topical };
  });
  const kept = scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_CHUNKS_PER_PAGE)
    .sort((a, b) => a.order - b.order)
    .map((c) => c.text);
  return kept.length ? kept : chunks.slice(0, 1);
}

/** Product names: trimmed, deduped case-insensitively, at most 10 of up to 80 characters. */
export function cleanNames(names: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names ?? []) {
    const name = raw.replace(/\s+/g, " ").trim().slice(0, 80);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * The stored stand-in for an author: a hash of site and handle, so quotes by
 * one person count once without keeping who they are. Null without a handle.
 */
export function authorKey(site: string, handle: string | null | undefined): string | null {
  // "u/name" (Reddit) and "@name" are the same person as "name".
  const h = handle
    ?.trim()
    .replace(/^(?:@|\/?u\/)/i, "")
    .toLowerCase();
  if (!h || h === "deleted" || h === "[deleted]" || h === "anonymous") return null;
  return createHash("sha256").update(`${site}:${h}`).digest("hex");
}

/** A date the model read off the page, when it parses and isn't in the future. */
export function parsePostedAt(raw: string | null | undefined, now: number): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim());
  const t = d.getTime();
  return Number.isNaN(t) || t > now + 86_400_000 || t < Date.UTC(1995, 0, 1) ? null : d;
}
