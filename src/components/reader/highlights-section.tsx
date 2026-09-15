import { HIGHLIGHT_COLORS, resolveInkColor, type Highlight } from "@/lib/store.ts";
import { Input } from "@/components/ui/input.tsx";

export function HighlightsSection({
  highlights,
  onNote,
  onRemove,
}: {
  highlights: Highlight[];
  onNote: (highlightId: string, note: string) => void;
  onRemove: (highlightId: string) => void;
}) {
  if (highlights.length === 0) {
    return <p className="mt-12 text-sm text-ink-muted">Select a passage to highlight it.</p>;
  }

  return (
    <section id="inked-passages" className="mt-14 scroll-mt-24 border-t border-line pt-8">
      <h2 className="font-display text-xl">Highlights</h2>
      <ul className="mt-4 space-y-4">
        {highlights.map((highlight) => {
          const color = HIGHLIGHT_COLORS.some((c) => c.id === highlight.color)
            ? highlight.color
            : resolveInkColor(highlight.color);
          return (
            <li key={highlight.id} className="rounded-md bg-surface p-3 shadow-border">
              <p
                data-hl={color}
                className="hl-quote rounded-sm px-1.5 py-0.5 font-display text-base leading-normal italic"
              >
                {highlight.text}
              </p>
              <Input
                value={highlight.note}
                data-note-for={highlight.id}
                onChange={(e) => onNote(highlight.id, e.target.value)}
                placeholder="Add a note…"
                aria-label="Note for highlight"
                className="mt-2"
              />
              <button
                type="button"
                className="mt-2 text-xs text-ink-muted underline decoration-faint underline-offset-2"
                onClick={() => onRemove(highlight.id)}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
