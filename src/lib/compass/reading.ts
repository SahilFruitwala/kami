/** Rules for turning a book update into reading on a habit's day. Pure. */

export type BookPosition = {
  currentPage: number | null;
  progressPercent: number;
};

/** A book at 0% is on page 0 even if it was never tracked by page. */
const pageOf = (p: BookPosition) => p.currentPage ?? (p.progressPercent === 0 ? 0 : null);

/**
 * What a progress update added: pages when both ends are tracked by page,
 * otherwise percentage points. Negative when progress moved back.
 */
export function readingDelta(
  before: BookPosition,
  after: BookPosition,
): { delta: number; unit: "pages" | "percent" } | null {
  const from = pageOf(before);
  const to = pageOf(after);
  if (from != null && to != null) {
    const delta = to - from;
    return delta === 0 ? null : { delta, unit: "pages" };
  }
  const delta = after.progressPercent - before.progressPercent;
  return delta === 0 ? null : { delta, unit: "percent" };
}

/**
 * Whether a day's reading counts as done. A threshold is in pages, so it only
 * applies to page amounts; a percent amount counts as soon as there is any.
 */
export function readingCounts(
  amount: number,
  unit: "pages" | "percent" | "minutes" | "articles",
  threshold: number | null,
): boolean {
  if (amount <= 0) return false;
  return threshold == null || unit !== "pages" ? true : amount >= threshold;
}

export type FinishedLink = { habitId: string; mode: "ask" | "auto"; bookId: string };
export type FinishedBook = { id: string; title: string; completedAt: number | null };

/**
 * Habits that a finished book fed, as suggestions for the next book. One per
 * habit, from the most recently finished book, keeping the mode it had. A
 * suggestion only ever offers a link; it never creates one.
 */
export function suggestFromFinished(
  links: FinishedLink[],
  finished: FinishedBook[],
): { habitId: string; mode: "ask" | "auto"; fromTitle: string }[] {
  const done = new Map(finished.map((b) => [b.id, b]));
  const best = new Map<string, { mode: "ask" | "auto"; fromTitle: string; at: number }>();
  for (const l of links) {
    const book = done.get(l.bookId);
    if (!book) continue;
    const at = book.completedAt ?? 0;
    const cur = best.get(l.habitId);
    if (!cur || at > cur.at) best.set(l.habitId, { mode: l.mode, fromTitle: book.title, at });
  }
  return [...best].map(([habitId, v]) => ({ habitId, mode: v.mode, fromTitle: v.fromTitle }));
}
