export type SelMenu = {
  text: string;
  x: number;
  y: number;
  rects: { top: number; left: number; width: number; height: number }[];
};

export type MenuRect = { top: number; left: number; width: number; height: number };

export type EditMenu = {
  highlightId: string;
  x: number;
  y: number;
  rects: MenuRect[];
};

const MENU_WIDTH = 260;
const MENU_HEIGHT = 60;
const GAP = 8;
const TOP_SAFE = 64;
const BOTTOM_SAFE = 88;

function placeMenu(
  lineRects: MenuRect[],
  fallback: MenuRect,
): { x: number; y: number; rects: MenuRect[] } | null {
  if (!lineRects.length) return null;
  const rects = lineRects.filter((r) => r.width > 0 && r.height > 0);
  if (!rects.length) return null;
  const first = rects[0] ?? fallback;
  const last = rects[rects.length - 1] ?? fallback;

  // Prefer above the first line so the menu never covers the highlight.
  // Fall back below the last line when there is no room above.
  let anchor = first!;
  let y = first!.top - MENU_HEIGHT - GAP;
  if (y < TOP_SAFE) {
    anchor = last!;
    y = last!.top + last!.height + GAP;
  }
  // Keep the menu inside the viewport vertically.
  y = Math.max(
    TOP_SAFE,
    Math.min(y, window.innerHeight - MENU_HEIGHT - BOTTOM_SAFE),
  );

  return {
    x: Math.min(
      window.innerWidth - MENU_WIDTH - 12,
      Math.max(12, anchor.left + anchor.width / 2 - MENU_WIDTH / 2),
    ),
    y,
    rects,
  };
}

/** Anchor a menu to an existing highlight's <mark> rects (tap-to-edit). */
export function highlightMenu(
  highlightId: string,
  mark: Element,
): EditMenu | null {
  const lineRects = [...mark.getClientRects()].map((r) => ({
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  }));
  const bounds = mark.getBoundingClientRect();
  const placed = placeMenu(
    lineRects.length ? lineRects : [{ top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height }],
    { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height },
  );
  if (!placed) return null;
  return { highlightId, x: placed.x, y: placed.y, rects: placed.rects };
}

export function selectionMenu(): SelMenu | null {
  const sel = window.getSelection();
  const text = sel?.toString().replace(/\s+/g, " ").trim() || "";
  if (!sel || !sel.rangeCount || text.length < 8) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const lineRects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
  const placed = placeMenu(
    lineRects.map((r) => ({ top: r.top, left: r.left, width: r.width, height: r.height })),
    { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
  );
  if (!placed) return null;
  return { text, x: placed.x, y: placed.y, rects: placed.rects };
}
