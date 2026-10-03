import { PenLine } from "lucide-react";
import { type LibraryItem } from "@/lib/store.ts";

export function MarginaliaHighlights({
  item,
  onNote,
  onRemove,
  onExport,
}: {
  item: LibraryItem;
  onNote: (highlightId: string, note: string) => void;
  onRemove: (highlightId: string) => void;
  onExport: () => void;
}) {
  if (item.highlights.length === 0) {
    return (
      <p className="mt-12 font-body text-sm italic opacity-60">
        Select a passage to highlight it — inked slips gather in the Highlight Vault.
      </p>
    );
  }
  return (
    <section id="inked-passages" className="mt-14 scroll-mt-32" aria-label="Highlights">
      <div className="flex items-center gap-4 opacity-40">
        <span className="h-px w-12 bg-current" aria-hidden="true" />
        <span className="font-display text-sm tracking-widest uppercase">End</span>
        <span className="h-px w-12 bg-current" aria-hidden="true" />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl">Inked Passages</h2>
        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-lg bg-hanko px-3 py-1.5 font-sans text-xs font-medium text-white shadow-sm transition-colors hover:bg-shu active:translate-y-px"
        >
          <PenLine className="size-3.5" aria-hidden="true" />
          Copy reading
        </button>
      </div>
      <ul className="mt-4 space-y-4">
        {item.highlights.map((highlight) => (
          <li key={highlight.id} className="rounded-lg bg-ink/5 p-4 shadow-sm">
            <p className="hl-quote rounded-sm px-1.5 py-0.5 font-body text-base leading-normal italic" data-hl={highlight.color}>
              {highlight.text}
            </p>
            <label className="mt-2 block">
              <span className="sr-only">Note for highlight</span>
              <input
                value={highlight.note}
                onChange={(e) => onNote(highlight.id, e.target.value)}
                placeholder="Add a marginalia note…"
                className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-hanko/30"
              />
            </label>
            <button
              type="button"
              className="mt-2 text-xs text-ink-muted underline underline-offset-2 hover:text-hanko"
              onClick={() => onRemove(highlight.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
