/**
 * Tidy state for an article's saved copy (see GLOSSARY.md: Tidy, Original
 * copy). Pure transitions; the server applies them to `articles` rows.
 * Tested in scripts/tidy-state.test.mjs.
 *
 *   pending  → saved, not tidied yet (single saves tidy in the background;
 *              bulk imports wait until first opened or narrated)
 *   tidied   → clutter removed (or none found); Original copy kept if changed
 *   skipped  → nothing safely removable (too short, or would gut the piece)
 *   failed   → the model call failed; the reader offers "Retry clean-up"
 *   restored → the reader put the Original copy back
 */

export const TIDY_STATES = ["pending", "tidied", "skipped", "failed", "restored"] as const;
export type TidyState = (typeof TIDY_STATES)[number];

export type TidyRecord = {
  contentHtml: string;
  /** The body before Tidy changed it; null when Tidy never changed it. */
  originalHtml: string | null;
  tidyState: TidyState;
};

export type TidyOutcome =
  | { kind: "removed"; contentHtml: string }
  | { kind: "nothing" }
  | { kind: "refused" }
  | { kind: "failed" };

export function asTidyState(value: unknown): TidyState {
  return TIDY_STATES.includes(value as TidyState) ? (value as TidyState) : "pending";
}

/**
 * A save arrives with a body for an article that may already exist.
 *
 * Clients re-send whole items (auto-tag, undo, link upgrades), often carrying
 * the body they loaded before a background Tidy finished. A body equal to the
 * current one, or to the Original copy, is that stale echo: keep what's
 * stored. Only a genuinely different body (a re-capture, a link stub upgraded
 * to a clean copy) replaces it and starts over at `pending`.
 */
export function onSave(existing: TidyRecord | null, incomingHtml: string): TidyRecord {
  if (!existing) return { contentHtml: incomingHtml, originalHtml: null, tidyState: "pending" };
  if (!incomingHtml.trim()) return existing;
  if (incomingHtml === existing.contentHtml) return existing;
  if (existing.originalHtml !== null && incomingHtml === existing.originalHtml) return existing;
  return { contentHtml: incomingHtml, originalHtml: null, tidyState: "pending" };
}

/** Apply the result of a Tidy run. */
export function onTidy(record: TidyRecord, outcome: TidyOutcome): TidyRecord {
  switch (outcome.kind) {
    case "removed":
      return {
        contentHtml: outcome.contentHtml,
        originalHtml: record.originalHtml ?? record.contentHtml,
        tidyState: "tidied",
      };
    case "nothing":
      return { ...record, tidyState: "tidied" };
    case "refused":
      return { ...record, tidyState: "skipped" };
    case "failed":
      return { ...record, tidyState: "failed" };
  }
}

/** Put the Original copy back. A no-op when there is none. */
export function onRestore(record: TidyRecord): TidyRecord {
  if (record.originalHtml === null) return record;
  return { contentHtml: record.originalHtml, originalHtml: null, tidyState: "restored" };
}

/** Whether a background or on-open Tidy should run (a failed one waits for Retry). */
export function wantsTidy(state: TidyState): boolean {
  return state === "pending";
}
