import { Trash2 } from "lucide-react";
import { HIGHLIGHT_COLORS, type HighlightColorId } from "@/lib/store.ts";
import type { EditMenu, SelMenu } from "@/lib/selection-menu.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Dokusho ink toolbar — floating pill over a text selection or an
 * existing highlight. Theme-aware (follows app + reader paper via
 * design tokens) and highlight-only: pick an ink to save, or — when
 * opened from an existing highlight — recolor it or remove it inline.
 * Only edit mode marks an ink as active: a fresh selection isn't
 * highlighted yet, so pre-selecting the last-used ink reads as applied.
 */
export function HighlightMenu({
  menu,
  activeColor,
  onInk,
  onRemove,
}: {
  menu: SelMenu | EditMenu;
  /** Current ink of the highlight being edited; omitted for a fresh selection. */
  activeColor?: HighlightColorId;
  onInk: (color: HighlightColorId) => void;
  onRemove?: () => void;
}) {
  const isEdit = onRemove != null;
  return (
    <>
      {menu.rects.map((rect, i) => (
        <div
          key={i}
          aria-hidden
          className="sel-ghost"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ))}
      <div
        data-highlight-menu
        role="toolbar"
        aria-label={isEdit ? "Edit highlight" : "Highlight this passage"}
        className="fixed z-40 flex items-center gap-1 rounded-full border border-line bg-surface/95 px-2 py-1.5 text-ink shadow-[var(--shadow-raised)] backdrop-blur-xl"
        style={{ left: menu.x, top: menu.y }}
      >
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            aria-label={isEdit ? `Change highlight to ${color.label}` : `Highlight in ${color.label}`}
            title={color.label}
            aria-pressed={isEdit ? activeColor === color.id : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onInk(color.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
              activeColor === color.id ? "bg-ink/10" : "hover:bg-ink/5",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 rounded-full",
                activeColor === color.id && "ring-2 ring-hanko ring-offset-1 ring-offset-surface",
              )}
              style={{ background: color.swatch }}
            />
            <span className="hidden font-sans text-xs font-medium min-[430px]:inline">
              {color.label}
            </span>
          </button>
        ))}
        {onRemove ? (
          <>
            <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-ink/10" />
            <button
              type="button"
              aria-label="Remove highlight"
              title="Remove highlight"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onRemove}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-sans text-xs font-medium text-ink-soft transition-colors hover:bg-ink/5 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              <span className="hidden min-[430px]:inline">Remove</span>
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
