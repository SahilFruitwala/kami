import { Minus, Plus } from "lucide-react";
import {
  HIGHLIGHT_COLORS,
  READER_FONTS,
  READER_FONT_SIZES,
  type HighlightColorId,
  type ReaderFontId,
} from "@/lib/store.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

export function ReaderPrefsPanel({
  readerFontSize,
  readerFont,
  highlightColor,
  onBumpSize,
  onFont,
  onHighlightColor,
}: {
  readerFontSize: number;
  readerFont: ReaderFontId;
  highlightColor: HighlightColorId;
  onBumpSize: (delta: number) => void;
  onFont: (font: ReaderFontId) => void;
  onHighlightColor: (color: HighlightColorId) => void;
}) {
  return (
    <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg bg-surface p-3 shadow-border">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Text size</p>
      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Decrease font size"
          disabled={readerFontSize <= 0}
          onClick={() => onBumpSize(-1)}
        >
          <Minus className="size-3.5" />
        </Button>
        <div className="flex flex-1 items-center justify-center gap-1">
          {READER_FONT_SIZES.map((_, i) => (
            <span
              key={i}
              className={cn("h-1.5 w-1.5 rounded-full", i === readerFontSize ? "bg-ink" : "bg-line")}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Increase font size"
          disabled={readerFontSize >= READER_FONT_SIZES.length - 1}
          onClick={() => onBumpSize(1)}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Font</p>
      <div className="mt-2 grid gap-1">
        {READER_FONTS.map((font) => (
          <button
            key={font.id}
            type="button"
            className={cn(
              "rounded-md px-2.5 py-2 text-left text-sm transition-colors",
              readerFont === font.id
                ? "bg-paper-warm text-ink"
                : "text-ink-soft hover:bg-paper-warm/60 hover:text-ink",
            )}
            style={{ fontFamily: font.family }}
            onClick={() => onFont(font.id)}
          >
            {font.label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Default highlight</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            aria-label={color.label}
            title={color.label}
            className={cn(
              "size-8 rounded-full border-2 transition-transform",
              highlightColor === color.id ? "scale-110 border-ink" : "border-transparent hover:scale-105",
            )}
            style={{ background: color.swatch }}
            onClick={() => onHighlightColor(color.id)}
          />
        ))}
      </div>
    </div>
  );
}
