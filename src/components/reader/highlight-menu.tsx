import { Highlighter } from "lucide-react";
import { HIGHLIGHT_COLORS, type HighlightColorId } from "@/lib/store.ts";
import type { SelMenu } from "@/lib/selection-menu.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

export function HighlightMenu({
  menu,
  activeColor,
  onSave,
}: {
  menu: SelMenu;
  activeColor: HighlightColorId;
  onSave: (color?: HighlightColorId) => void;
}) {
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
        className="fixed z-40 rounded-lg bg-surface p-2 shadow-border"
        style={{ left: menu.x, top: menu.y }}
      >
        <div className="flex items-center gap-1.5">
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              aria-label={`Highlight ${color.label}`}
              title={color.label}
              className={cn(
                "size-8 rounded-full border-2 transition-transform hover:scale-110",
                activeColor === color.id ? "border-ink" : "border-transparent",
              )}
              style={{ background: color.swatch }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSave(color.id)}
            />
          ))}
        </div>
        <Button
          size="sm"
          className="mt-2 w-full gap-2"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSave()}
        >
          <Highlighter className="size-3.5" />
          Highlight
        </Button>
      </div>
    </>
  );
}
