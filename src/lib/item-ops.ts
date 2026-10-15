import { LIBRARY_LIMITS, type Highlight, type HighlightColorId } from "./library-item.ts";

/**
 * Incremental edits to an item's tags / highlights.
 *
 * The client sends *what changed* instead of the whole array, and the server
 * applies the ops to the row it holds under a row lock. Two tabs editing the
 * same work then merge instead of the later write silently dropping the
 * earlier tab's tags or highlights.
 */

export const MAX_TAGS = LIBRARY_LIMITS.tags;
export const MAX_HIGHLIGHTS = LIBRARY_LIMITS.highlights;
/** Longest marginalia note kept on a single highlight. */
export const HIGHLIGHT_NOTE_MAX = LIBRARY_LIMITS.highlightNote;

export type TagOp =
  | { op: "add"; tag: string }
  | { op: "remove"; tag: string }
  | { op: "rename"; from: string; to: string };

export type HighlightOp =
  | { op: "add"; highlight: Highlight }
  | { op: "remove"; id: string }
  | { op: "update"; id: string; color?: HighlightColorId; note?: string };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Apply tag ops (case-insensitive, de-duplicated, capped at MAX_TAGS). */
export function applyTagOps(tags: readonly string[], ops: readonly TagOp[]): string[] {
  let next = [...tags];
  for (const op of ops) {
    if (op.op === "add") {
      if (op.tag && !next.some((t) => same(t, op.tag))) next = [...next, op.tag];
    } else if (op.op === "remove") {
      next = next.filter((t) => !same(t, op.tag));
    } else if (op.to) {
      next = next
        .map((t) => (same(t, op.from) ? op.to : t))
        .filter((t, i, arr) => arr.findIndex((x) => same(x, t)) === i);
    }
  }
  return next.slice(0, MAX_TAGS);
}

/** Insert `h` keeping the list newest-first (an undo restores it in place). */
function insertByCreatedAt(list: readonly Highlight[], h: Highlight): Highlight[] {
  const at = list.findIndex((x) => x.createdAt <= h.createdAt);
  return at === -1 ? [...list, h] : [...list.slice(0, at), h, ...list.slice(at)];
}

/** Apply highlight ops (newest first, de-duplicated by text, capped). */
export function applyHighlightOps(
  highlights: readonly Highlight[],
  ops: readonly HighlightOp[],
): Highlight[] {
  let next = [...highlights];
  for (const op of ops) {
    if (op.op === "add") {
      const h = op.highlight;
      if (!next.some((x) => x.id === h.id || x.text === h.text)) next = insertByCreatedAt(next, h);
    } else if (op.op === "remove") {
      next = next.filter((h) => h.id !== op.id);
    } else {
      next = next.map((h) =>
        h.id !== op.id
          ? h
          : {
              ...h,
              ...(op.color !== undefined ? { color: op.color } : {}),
              ...(op.note !== undefined ? { note: op.note.slice(0, HIGHLIGHT_NOTE_MAX) } : {}),
            },
      );
    }
  }
  return next.slice(0, MAX_HIGHLIGHTS);
}
