import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Layers, LoaderCircle, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import type { Slip } from "@/components/library/vault-parts.tsx";
import { aiApi, type VaultFlashcard, type VaultSlipInput, type VaultThemes } from "@/lib/api/ai";
import type { LibraryItem } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

/** Most slips sent for themes; flashcards use the first 40 of these. */
const MAX_SLIPS = 150;

const toInput = ({ item, highlight }: Slip): VaultSlipInput => ({
  id: highlight.id,
  text: highlight.text.slice(0, 1500),
  note: highlight.note.slice(0, 1000),
  title: item.title.slice(0, 300),
  author: (item.author || item.siteName || "").slice(0, 200),
});

const message = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** AI over the slips on screen: themes and connections, or study flashcards. */
export function VaultAi({
  slips,
  onOpenItem,
}: {
  slips: Slip[];
  onOpenItem: (item: LibraryItem) => void;
}) {
  const [result, setResult] = useState<
    { kind: "themes"; data: VaultThemes } | { kind: "cards"; cards: VaultFlashcard[] } | null
  >(null);
  const input = useMemo(() => slips.slice(0, MAX_SLIPS).map(toInput), [slips]);
  const byId = useMemo(() => new Map(slips.map((s) => [s.highlight.id, s])), [slips]);

  const themes = useMutation({
    mutationFn: () => aiApi.vaultThemes(input),
    onSuccess: (data) => setResult({ kind: "themes", data }),
    onError: (err) => toast.error(message(err, "Could not find themes.")),
  });
  const cards = useMutation({
    mutationFn: () => aiApi.vaultFlashcards(input),
    onSuccess: (data) => {
      if (!data.cards.length) toast.info("These highlights didn't yield any cards.");
      setResult({ kind: "cards", cards: data.cards });
    },
    onError: (err) => toast.error(message(err, "Could not make flashcards.")),
  });
  const busy = themes.isPending || cards.isPending;

  return (
    <section aria-label="Patterns in your highlights" className="kami-sheet space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto flex items-center gap-2 font-sans text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-hanko" aria-hidden="true" />
          Patterns
          <span className="font-normal text-ink-muted">
            · {Math.min(slips.length, MAX_SLIPS)} slip{slips.length === 1 ? "" : "s"} in view
          </span>
        </p>
        <ActionButton
          onClick={() => themes.mutate()}
          disabled={busy || slips.length < 3}
          pending={themes.isPending}
          title={slips.length < 3 ? "Needs at least three highlights" : undefined}
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          Find themes
        </ActionButton>
        <ActionButton
          onClick={() => cards.mutate()}
          disabled={busy || !slips.length}
          pending={cards.isPending}
        >
          <Layers className="size-3.5" aria-hidden="true" />
          Make flashcards
        </ActionButton>
        {result ? (
          <button
            type="button"
            onClick={() => setResult(null)}
            aria-label="Close results"
            className="flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-paper-warm hover:text-ink"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {result?.kind === "themes" ? (
        <ThemesView data={result.data} byId={byId} onOpenItem={onOpenItem} />
      ) : result?.kind === "cards" ? (
        <CardsView cards={result.cards} byId={byId} />
      ) : (
        <p className="font-body text-sm text-ink-muted">
          Filter the vault to a tag, author or search, then find the themes running through those
          highlights or turn them into flashcards.
        </p>
      )}
    </section>
  );
}

function ActionButton({
  onClick,
  disabled,
  pending,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  pending: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 font-sans text-xs font-medium text-ink shadow-[var(--shadow-border)] transition-colors hover:bg-paper-warm disabled:opacity-50"
    >
      {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function SlipQuote({
  slip,
  onOpenItem,
}: {
  slip: Slip | undefined;
  onOpenItem: (item: LibraryItem) => void;
}) {
  if (!slip) return null;
  const text = slip.highlight.text;
  return (
    <li className="list-none">
      <button
        type="button"
        onClick={() => onOpenItem(slip.item)}
        className="text-left font-body text-xs leading-snug text-ink-soft italic transition-colors hover:text-hanko"
      >
        “{text.length > 140 ? `${text.slice(0, 140)}…` : text}”
        <span className="not-italic text-ink-muted"> — {slip.item.title}</span>
      </button>
    </li>
  );
}

function ThemesView({
  data,
  byId,
  onOpenItem,
}: {
  data: VaultThemes;
  byId: Map<string, Slip>;
  onOpenItem: (item: LibraryItem) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        {data.themes.map((theme) => (
          <article key={theme.title} className="space-y-2 rounded-lg bg-bg/70 p-4">
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-display text-lg text-ink">{theme.title}</span>
              <span className="font-sans text-[11px] text-ink-muted">{theme.slipIds.length}</span>
            </p>
            <p className="font-body text-sm leading-relaxed text-ink">{theme.insight}</p>
            <ul className="space-y-1.5">
              {theme.slipIds.slice(0, 3).map((id) => (
                <SlipQuote key={id} slip={byId.get(id)} onOpenItem={onOpenItem} />
              ))}
            </ul>
          </article>
        ))}
      </div>
      {data.connections.length ? (
        <div className="space-y-2">
          <p className="kami-label text-ink-muted">Connections</p>
          {data.connections.map((c, i) => (
            <div key={i} className="space-y-1.5 border-l-2 border-hanko/40 pl-3">
              <p className="font-body text-sm text-ink">{c.insight}</p>
              <ul className="space-y-1">
                {c.slipIds.slice(0, 3).map((id) => (
                  <SlipQuote key={id} slip={byId.get(id)} onOpenItem={onOpenItem} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {data.questions.length ? (
        <div className="space-y-1.5">
          <p className="kami-label text-ink-muted">Worth exploring</p>
          <ul className="list-disc space-y-1 pl-5 font-body text-sm text-ink">
            {data.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CardsView({ cards, byId }: { cards: VaultFlashcard[]; byId: Map<string, Slip> }) {
  const [shown, setShown] = useState<Set<number>>(() => new Set());
  if (!cards.length) return null;

  function exportCsv() {
    // Anki imports "front,back" CSV; the source goes in a third column.
    const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const rows = cards.map((c) =>
      [c.front, c.back, byId.get(c.slipId)?.item.title ?? ""].map(esc).join(","),
    );
    download(`${rows.join("\n")}\n`, "kami-flashcards.csv", "text/csv");
  }

  function exportMarkdown() {
    const text = cards
      .map(
        (c) =>
          `**Q:** ${c.front}\n\n**A:** ${c.back}${byId.get(c.slipId) ? `\n\n*${byId.get(c.slipId)!.item.title}*` : ""}`,
      )
      .join("\n\n---\n\n");
    download(`# Flashcards\n\n${text}\n`, "kami-flashcards.md", "text/markdown");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto font-sans text-xs text-ink-muted">
          {cards.length} card{cards.length === 1 ? "" : "s"} · tap a card to reveal the answer
        </p>
        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center gap-1 rounded px-2 py-1 font-sans text-xs text-hanko transition-colors hover:bg-shu-tint"
          title="Download as CSV (Anki: front, back, source)"
        >
          <Download className="size-[15px]" aria-hidden="true" />
          CSV
        </button>
        <button
          type="button"
          onClick={exportMarkdown}
          className="flex items-center gap-1 rounded px-2 py-1 font-sans text-xs text-hanko transition-colors hover:bg-shu-tint"
        >
          MD
        </button>
      </div>
      <ol className="grid gap-3 md:grid-cols-2">
        {cards.map((card, i) => {
          const open = shown.has(i);
          return (
            <li key={i} className="list-none">
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setShown((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
                className={cn(
                  "flex min-h-28 w-full flex-col gap-2 rounded-lg p-4 text-left transition-colors",
                  open ? "bg-shu-tint" : "bg-bg/70 hover:bg-paper-warm",
                )}
              >
                <span className="font-body text-sm font-medium text-ink">{card.front}</span>
                {open ? (
                  <span className="font-body text-sm leading-relaxed text-ink-soft">
                    {card.back}
                  </span>
                ) : (
                  <span className="mt-auto font-sans text-[11px] text-ink-muted">Show answer</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
