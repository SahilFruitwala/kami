import { Minus, Plus } from "lucide-react";
import {
  HIGHLIGHT_COLORS,
  READER_FONTS,
  READER_FONT_SIZES,
  type HighlightColorId,
  type ReaderFontId,
} from "@/lib/store.ts";
import { PAPER_TONES, type PaperTone } from "@/lib/paper-tones.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

export function ReaderPrefsPanel({
  readerFontSize,
  readerFont,
  highlightColor,
  paperTone,
  onBumpSize,
  onFont,
  onHighlightColor,
  onPaperTone,
}: {
  readerFontSize: number;
  readerFont: ReaderFontId;
  highlightColor: HighlightColorId;
  paperTone: PaperTone;
  onBumpSize: (delta: number) => void;
  onFont: (font: ReaderFontId) => void;
  onHighlightColor: (color: HighlightColorId) => void;
  onPaperTone: (tone: PaperTone) => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Reading preferences"
      className="screen-scroll fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top))] z-40 max-h-[calc(100dvh-5rem-env(safe-area-inset-top))] overflow-y-auto rounded-xl border border-line bg-surface p-3.5 shadow-device sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[80vh] sm:w-64"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Paper</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label="Paper tone">
        {PAPER_TONES.map((toneOption) => (
          <button
            key={toneOption.id}
            type="button"
            title={toneOption.label}
            aria-label={toneOption.label}
            aria-pressed={paperTone === toneOption.id}
            onClick={() => onPaperTone(toneOption.id)}
            className={cn(
              "flex min-h-11 flex-col items-center gap-1.5 rounded-lg px-2 py-2 transition-colors",
              paperTone === toneOption.id
                ? "bg-paper-warm font-semibold shadow-xs ring-1 ring-hanko/40"
                : "hover:bg-paper-warm/60",
            )}
          >
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-md text-[11px] font-bold"
              style={{
                backgroundColor: toneOption.bg,
                color: toneOption.fg,
                border: "1px solid var(--color-line)",
              }}
            >
              {toneOption.glyph}
            </span>
            <span
              className={cn(
                "text-[11px] font-medium",
                paperTone === toneOption.id ? "text-ink" : "text-ink-soft",
              )}
            >
              {toneOption.shortLabel}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">Text size</p>
      <div className="mt-2.5 flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Decrease font size"
          disabled={readerFontSize <= 0}
          className="size-11 bg-paper-warm text-ink hover:bg-paper-warm/80 sm:size-9"
          onClick={() => onBumpSize(-1)}
        >
          <Minus className="size-4" aria-hidden="true" />
        </Button>
        <div className="flex flex-1 items-center justify-center gap-1.5 px-1" aria-hidden="true">
          {READER_FONT_SIZES.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                i === readerFontSize ? "bg-ink scale-125" : "bg-faint",
              )}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Increase font size"
          disabled={readerFontSize >= READER_FONT_SIZES.length - 1}
          className="size-11 bg-paper-warm text-ink hover:bg-paper-warm/80 sm:size-9"
          onClick={() => onBumpSize(1)}
        >
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">Font</p>
      <div className="mt-2 grid gap-1">
        {READER_FONTS.map((font) => (
          <button
            key={font.id}
            type="button"
            className={cn(
              "min-h-11 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
              readerFont === font.id
                ? "bg-paper-warm text-ink font-semibold shadow-xs"
                : "text-ink-soft hover:bg-paper-warm/60 hover:text-ink",
            )}
            style={{ fontFamily: font.family }}
            onClick={() => onFont(font.id)}
          >
            {font.label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">
        Default highlight
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            aria-label={color.label}
            title={color.label}
            className={cn(
              "size-11 rounded-full border-2 transition-transform sm:size-8",
              highlightColor === color.id
                ? "scale-110 border-ink ring-2 ring-ink/30"
                : "border-transparent hover:scale-105",
            )}
            style={{ background: color.swatch }}
            onClick={() => onHighlightColor(color.id)}
          />
        ))}
      </div>
    </div>
  );
}
