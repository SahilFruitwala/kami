export type SelMenu = {
  text: string;
  x: number;
  y: number;
  rects: { top: number; left: number; width: number; height: number }[];
};

const MENU_WIDTH = 208;
const MENU_HEIGHT = 100;
const GAP = 8;
const TOP_SAFE = 64;

export function selectionMenu(): SelMenu | null {
  const sel = window.getSelection();
  const text = sel?.toString().replace(/\s+/g, " ").trim() || "";
  if (!sel || !sel.rangeCount || text.length < 8) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const lineRects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  const rects = lineRects.map((r) => ({
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  }));
  const first = lineRects[0] ?? rect;
  const last = lineRects[lineRects.length - 1] ?? rect;

  // Prefer above the first line so the menu never covers the highlight.
  // Fall back below the last line when there is no room above.
  let anchor = first;
  let y = first.top - MENU_HEIGHT - GAP;
  if (y < TOP_SAFE) {
    anchor = last;
    y = last.bottom + GAP;
  }
  // Keep the menu inside the viewport vertically.
  y = Math.max(TOP_SAFE, Math.min(y, window.innerHeight - MENU_HEIGHT - 12));

  return {
    text,
    x: Math.min(
      window.innerWidth - MENU_WIDTH - 12,
      Math.max(12, anchor.left + anchor.width / 2 - MENU_WIDTH / 2),
    ),
    y,
    rects,
  };
}
