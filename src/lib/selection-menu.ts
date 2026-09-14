export type SelMenu = {
  text: string;
  x: number;
  y: number;
  rects: { top: number; left: number; width: number; height: number }[];
};

export function selectionMenu(): SelMenu | null {
  const sel = window.getSelection();
  const text = sel?.toString().replace(/\s+/g, " ").trim() || "";
  if (!sel || !sel.rangeCount || text.length < 8) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const rects = [...range.getClientRects()].map((r) => ({
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  }));
  const above = rect.top - 48;
  const y = above < 64 ? rect.bottom + 8 : above;
  return {
    text,
    x: Math.min(window.innerWidth - 220, Math.max(12, rect.left + rect.width / 2 - 110)),
    y,
    rects,
  };
}
