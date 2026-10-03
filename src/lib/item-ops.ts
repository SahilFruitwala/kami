import type { Highlight, HighlightColorId } from "./store.ts";

/**
 * Incremental edits to an item's tags / highlights.
 *
 * The client sends *what changed* instead of the whole array, and the server
 * applies the ops to the row it holds under a row lock. Two tabs editing the
 * same work then merge instead of the later write silently dropping the
 * earlier tab's tags or highlights.
 */

export const MAX_TAGS = 12;
export const MAX_HIGHLIGHTS = 80;

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

/** Apply highlight ops (newest first, de-duplicated by text, capped). */
export function applyHighlightOps(
  highlights: readonly Highlight[],
  ops: readonly HighlightOp[],
): Highlight[] {
  let next = [...highlights];
  for (const op of ops) {
    if (op.op === "add") {
      const h = op.highlight;
      if (!next.some((x) => x.id === h.id || x.text === h.text)) next = [h, ...next];
    } else if (op.op === "remove") {
      next = next.filter((h) => h.id !== op.id);
    } else {
      next = next.map((h) =>
        h.id !== op.id
          ? h
          : {
              ...h,
              ...(op.color !== undefined ? { color: op.color } : {}),
              ...(op.note !== undefined ? { note: op.note.slice(0, 280) } : {}),
            },
      );
    }
  }
  return next.slice(0, MAX_HIGHLIGHTS);
}
