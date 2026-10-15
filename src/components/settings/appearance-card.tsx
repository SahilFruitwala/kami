import { READER_FONTS, READER_FONT_SIZES, useReaderPrefs } from "@/lib/reader-prefs.ts";
import { HIGHLIGHT_COLORS } from "@/lib/library-item.ts";
import { PAPER_TONES } from "@/lib/paper-tones.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { cn } from "@/lib/utils.ts";
import { Card, FieldLabel } from "@/components/settings/settings-ui.tsx";

export function AppearanceCard() {
  const { theme, isSystem, setTheme, followSystem } = useTheme();
  const readerFontSize = useReaderPrefs((s) => s.readerFontSize);
  const readerFont = useReaderPrefs((s) => s.readerFont);
  const highlightColor = useReaderPrefs((s) => s.highlightColor);
  const paperTone = useReaderPrefs((s) => s.paperTone);
  const bumpReaderFontSize = useReaderPrefs((s) => s.bumpReaderFontSize);
  const setReaderFont = useReaderPrefs((s) => s.setReaderFont);
  const setHighlightColor = useReaderPrefs((s) => s.setHighlightColor);
  const setPaperTone = useReaderPrefs((s) => s.setPaperTone);

  return (
    <Card
      id="appearance"
      title="Appearance"
      copy="Theme, paper, and type. Mirrors the reader preferences popover — change it here or there."
    >
      <div>
        <FieldLabel>Theme</FieldLabel>
        <div
          className="mt-2 inline-flex rounded-lg bg-paper-warm p-1"
          role="group"
          aria-label="Color theme"
        >
          {(
            [
              ["light", "Light"],
              ["dark", "Dark"],
              ["system", "System"],
            ] as const
          ).map(([id, label]) => {
            const active = id === "system" ? isSystem : theme === id && !isSystem;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => (id === "system" ? followSystem() : setTheme(id))}
                className={cn(
                  "rounded-md px-4 py-1.5 font-sans text-xs transition-colors",
                  active
                    ? "bg-surface font-semibold text-hanko shadow-sm"
                    : "text-ink-soft hover:text-ink",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <FieldLabel>Paper tone</FieldLabel>
        <div
          className="mt-2 grid max-w-lg grid-cols-1 gap-2 min-[420px]:grid-cols-3"
          role="group"
          aria-label="Paper tone"
        >
          {PAPER_TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={paperTone === t.id}
              onClick={() => setPaperTone(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                paperTone === t.id
                  ? "bg-paper-warm shadow-xs ring-1 ring-hanko/40"
                  : "bg-bg/60 hover:bg-paper-warm/70",
              )}
            >
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-md text-xs font-bold"
                style={{
                  backgroundColor: t.bg,
                  color: t.fg,
                  border: "1px solid var(--color-line)",
                }}
              >
                {t.glyph}
              </span>
              <span className="font-sans text-xs font-medium text-ink">{t.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <FieldLabel>Reader font</FieldLabel>
          <div className="mt-2 grid gap-1">
            {READER_FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={readerFont === f.id}
                onClick={() => setReaderFont(f.id)}
                style={{ fontFamily: f.family }}
                className={cn(
                  "rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  readerFont === f.id
                    ? "bg-paper-warm font-semibold text-ink shadow-xs"
                    : "text-ink-soft hover:bg-paper-warm/60 hover:text-ink",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Text size & highlight</FieldLabel>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease font size"
              disabled={readerFontSize <= 0}
              onClick={() => bumpReaderFontSize(-1)}
              className="flex size-9 items-center justify-center rounded-lg bg-paper-warm text-ink disabled:opacity-40"
            >
              −
            </button>
            <div className="flex flex-1 items-center justify-center gap-1.5" aria-hidden="true">
              {READER_FONT_SIZES.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-2 w-2 rounded-full",
                    i === readerFontSize ? "scale-125 bg-ink" : "bg-faint",
                  )}
                />
              ))}
            </div>
            <button
              type="button"
              aria-label="Increase font size"
              disabled={readerFontSize >= READER_FONT_SIZES.length - 1}
              onClick={() => bumpReaderFontSize(1)}
              className="flex size-9 items-center justify-center rounded-lg bg-paper-warm text-ink disabled:opacity-40"
            >
              +
            </button>
          </div>
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="group"
            aria-label="Default highlight color"
          >
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.label}
                title={c.label}
                aria-pressed={highlightColor === c.id}
                onClick={() => setHighlightColor(c.id)}
                style={{ background: c.swatch }}
                className={cn(
                  "size-8 rounded-full border-2 transition-transform",
                  highlightColor === c.id
                    ? "scale-110 border-ink ring-2 ring-ink/30"
                    : "border-transparent hover:scale-105",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
