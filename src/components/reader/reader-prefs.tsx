import { Minus, Moon, Plus, Sun } from "lucide-react";
import {
  HIGHLIGHT_COLORS,
  READER_FONTS,
  READER_FONT_SIZES,
  type HighlightColorId,
  type ReaderFontId,
} from "@/lib/store.ts";
import { useThemeStore } from "@/hooks/use-theme.ts";
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
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  return (
    <div
      role="dialog"
      aria-label="Reading preferences"
      className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl bg-surface p-3.5 shadow-device border border-line"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Text size</p>
      <div className="mt-2.5 flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Decrease font size"
          disabled={readerFontSize <= 0}
          className="size-9 bg-paper-warm text-ink hover:bg-paper-warm/80"
          onClick={() => onBumpSize(-1)}
        >
          <Minus className="size-4" />
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
          className="size-9 bg-paper-warm text-ink hover:bg-paper-warm/80"
          onClick={() => onBumpSize(1)}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">Font</p>
      <div className="mt-2 grid gap-1">
        {READER_FONTS.map((font) => (
          <button
            key={font.id}
            type="button"
            className={cn(
              "rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
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

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">Theme</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          aria-pressed={theme === "light"}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
            theme === "light"
              ? "bg-paper-warm text-ink font-semibold shadow-xs"
              : "text-ink-soft hover:bg-paper-warm/60 hover:text-ink",
          )}
          onClick={() => setTheme("light")}
        >
          <Sun className="size-4" />
          Light
        </button>
        <button
          type="button"
          aria-pressed={theme === "dark"}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
            theme === "dark"
              ? "bg-paper-warm text-ink font-semibold shadow-xs"
              : "text-ink-soft hover:bg-paper-warm/60 hover:text-ink",
          )}
          onClick={() => setTheme("dark")}
        >
          <Moon className="size-4" />
          Dark
        </button>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">Default highlight</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            aria-label={color.label}
            title={color.label}
            className={cn(
              "size-8 rounded-full border-2 transition-transform",
              highlightColor === color.id ? "scale-110 border-ink ring-2 ring-ink/30" : "border-transparent hover:scale-105",
            )}
            style={{ background: color.swatch }}
            onClick={() => onHighlightColor(color.id)}
          />
        ))}
      </div>
    </div>
  );
}
