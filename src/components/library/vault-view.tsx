import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Network, LayoutGrid, PenLine, Search, Tag, User, Waves } from "lucide-react";
import { toast } from "sonner";
import { Hanko } from "@/components/kami.tsx";
import { Input } from "@/components/ui/input.tsx";
import { VaultAi } from "@/components/library/vault-ai.tsx";
import { useAiStatus } from "@/hooks/use-ai.ts";
import type { LibraryItem } from "@/lib/store.ts";
import { useLibraryStore } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

import {
  InkSparkline,
  MetricDot,
  ModeButton,
  SlipCard,
  SortButton,
  type Slip,
  type VaultSort,
  type VaultViewMode,
} from "@/components/library/vault-parts.tsx";

export function VaultView({
  query,
  initialMode,
  initialSort,
  initialTag,
  initialAuthor,
  initialLocalQuery,
  onParamsChange,
  onOpenItem,
  onExitVault,
  onTranscribe,
}: {
  query: string;
  initialMode?: string;
  initialSort?: string;
  initialTag?: string;
  initialAuthor?: string;
  initialLocalQuery?: string;
  onParamsChange?: (params: { mode: VaultViewMode; sort: VaultSort; tag: string | null; author: string | null; q: string }) => void;
  onOpenItem: (item: LibraryItem) => void;
  onExitVault: () => void;
  onTranscribe: () => void;
}) {
  const library = useLibraryStore((s) => s.library);
  const ai = useAiStatus();
  const [mode, setMode] = useState<VaultViewMode>(initialMode === "river" || initialMode === "web" ? initialMode : "tanzaku");
  const [sort, setSort] = useState<VaultSort>(initialSort === "linked" || initialSort === "source" ? initialSort : "recent");
  const [tag, setTag] = useState<string | null>(initialTag ?? null);
  const [author, setAuthor] = useState<string | null>(initialAuthor ?? null);
  const [localQuery, setLocalQuery] = useState(initialLocalQuery ?? "");
  const [notesOnly, setNotesOnly] = useState(false);
  const paramsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deep-linking: view state → URL (debounced so typing doesn't spam history).
  useEffect(() => {
    if (!onParamsChange) return;
    if (paramsTimer.current) clearTimeout(paramsTimer.current);
    paramsTimer.current = setTimeout(() => {
      onParamsChange({ mode, sort, tag, author, q: localQuery });
    }, 300);
    return () => {
      if (paramsTimer.current) clearTimeout(paramsTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, sort, tag, author, localQuery]);

  const slips = useMemo<Slip[]>(
    () =>
      library.flatMap((item) =>
        (item.highlights ?? []).map((highlight) => ({ item, highlight })),
      ),
    [library],
  );

  const q = `${query} ${localQuery}`.trim().toLowerCase();

  const filtered = useMemo(() => {
    const out = slips.filter(({ item, highlight }) => {
      if (tag && !(item.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase()))
        return false;
      if (author && (item.author || "").toLowerCase() !== author.toLowerCase()) return false;
      if (notesOnly && !highlight.note.trim()) return false;
      if (!q) return true;
      return [highlight.text, highlight.note, item.title, item.author, item.siteName, ...(item.tags ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const by: Record<VaultSort, (a: Slip, b: Slip) => number> = {
      recent: (a, b) => b.highlight.createdAt - a.highlight.createdAt,
      linked: (a, b) => b.highlight.note.length - a.highlight.note.length,
      source: (a, b) => b.item.savedAt - a.item.savedAt,
    };
    return [...out].sort(by[sort]);
  }, [slips, tag, author, q, sort, notesOnly]);

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const { item } of slips) {
      for (const t of item.tags ?? []) {
        map.set(t, (map.get(t) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [slips]);

  const authorCounts = useMemo(() => {
    const map = new Map<string, { name: string; work: string; count: number }>();
    for (const { item } of slips) {
      const key = (item.author || item.siteName || "Unknown hand").toLowerCase();
      const prev = map.get(key);
      if (prev) prev.count += 1;
      else
        map.set(key, {
          name: item.author || item.siteName || "Unknown hand",
          work: item.title,
          count: 1,
        });
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [slips]);

  const articlesConnected = useMemo(
    () => new Set(slips.map((s) => s.item.id)).size,
    [slips],
  );

  const journalTies = useMemo(
    () => slips.filter((s) => s.highlight.note.trim().length > 0).length,
    [slips],
  );

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportMarkdown() {
    const lines = filtered.map(
      ({ item, highlight }) =>
        `> ${highlight.text}\n>\n> — ${item.author || item.siteName || "Unknown"}, *${item.title}*${highlight.note ? `\n\nMarginalia: ${highlight.note}` : ""}`,
    );
    downloadBlob(
      new Blob([`# Highlight Vault — Inked Passages\n\n${lines.join("\n\n---\n\n")}\n`], { type: "text/markdown" }),
      "highlight-vault.md",
    );
    toast.success("Vault exported as markdown");
  }

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = filtered.map(({ item, highlight }) =>
      [
        new Date(highlight.createdAt).toISOString(),
        item.title,
        item.author || item.siteName || "",
        item.url,
        (item.tags ?? []).join("; "),
        highlight.text,
        highlight.note,
      ].map(esc).join(","),
    );
    downloadBlob(
      new Blob([`created_at,title,author,url,tags,passage,note\n${rows.join("\n")}\n`], { type: "text/csv" }),
      "highlight-vault.csv",
    );
    toast.success("Vault exported as CSV");
  }

  if (slips.length === 0) {
    return (
      <div className="kami-sheet mx-auto flex max-w-2xl flex-col items-center gap-3 px-6 py-16 text-center">
        <Hanko glyph="V" className="size-12 text-xl" />
        <p className="font-display text-2xl text-ink-soft italic">The vault awaits its first slip</p>
        <p className="max-w-sm font-body text-sm leading-relaxed text-ink-muted">
          Open any work and select a passage — inked highlights are pressed here as
          highlight slips, ready to cite in your journal.
        </p>
        <button
          type="button"
          onClick={onExitVault}
          className="mt-2 rounded-full bg-hanko px-5 py-2.5 font-sans text-sm font-medium text-paper hover:bg-shu"
        >
          Return to the Desk
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Metric pulse ribbon */}
      <div className="flex flex-wrap items-center gap-2.5">
        <MetricDot color="bg-hanko" label={`${slips.length} Passages Inked`} strong />
        <MetricDot color="bg-ok" label={`${articlesConnected} Articles Connected`} />
        <MetricDot color="bg-ink-accent" label={`${journalTies} Journal Ties`} />
        <span className="flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 shadow-[var(--shadow-border)]">
          <Tag className="size-3.5 text-ink-muted" aria-hidden="true" />
          <span className="font-sans text-xs text-ink-muted">{tagCounts.length} Thematic Tags</span>
        </span>
        <div className="ml-auto inline-flex items-center self-start rounded-lg bg-paper-warm p-1 md:self-auto">
          <ModeButton active={mode === "tanzaku"} onClick={() => setMode("tanzaku")}>
            <LayoutGrid className="size-4" aria-hidden="true" />
            Slips
          </ModeButton>
          <ModeButton active={mode === "river"} onClick={() => setMode("river")}>
            <Waves className="size-4" aria-hidden="true" />
            Timeline River
          </ModeButton>
          <ModeButton active={mode === "web"} onClick={() => setMode("web")}>
            <Network className="size-4" aria-hidden="true" />
            Concept Web
          </ModeButton>
        </div>
      </div>

      {/* Filter strip */}
      <div className="kami-sheet flex flex-col justify-between gap-3 p-3 md:flex-row md:items-center">
        <div className="relative flex flex-1 items-center">
          <Search className="absolute left-3 size-5 text-ink-muted" aria-hidden="true" />
          <label htmlFor="vault-search" className="sr-only">
            Filter vault
          </label>
          <Input
            id="vault-search"
            name="vault-q"
            type="search"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Filter by concept, author, or feeling…"
            className="border-0 bg-bg/70 pr-4 pl-10 shadow-none focus-visible:ring-2 focus-visible:ring-hanko/40"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="pl-1 font-sans text-[11px] tracking-wider text-ink-muted uppercase">
            Sort:
          </span>
          <SortButton active={sort === "recent"} onClick={() => setSort("recent")}>
            Recent Inking
          </SortButton>
          <SortButton active={sort === "linked"} onClick={() => setSort("linked")}>
            Most Linked
          </SortButton>
          <SortButton active={sort === "source"} onClick={() => setSort("source")}>
            Source Chronology
          </SortButton>
          <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
          <SortButton active={notesOnly} onClick={() => setNotesOnly((v) => !v)}>
            With notes
          </SortButton>
          <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />
          <button
            type="button"
            onClick={exportMarkdown}
            className="flex items-center gap-1 rounded px-2 py-1 font-sans text-xs text-hanko transition-colors hover:bg-shu-tint"
            title="Download filtered slips as markdown"
          >
            <Download className="size-[15px]" aria-hidden="true" />
            MD
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-1 rounded px-2 py-1 font-sans text-xs text-hanko transition-colors hover:bg-shu-tint"
            title="Download filtered slips as CSV"
          >
            CSV
          </button>
        </div>
      </div>

      <p className="font-sans text-xs text-ink-muted" role="status" aria-live="polite">
        Showing {filtered.length} of {slips.length} slips{tag ? ` tagged #${tag}` : ""}{author ? ` by ${author}` : ""}{notesOnly ? " with notes" : ""}{q ? ` matching “${localQuery || query}”` : ""}
      </p>

      {(tag || author || localQuery || notesOnly) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-sans text-xs text-ink-muted">Filtered by</span>
          {tag ? (
            <button
              type="button"
              onClick={() => setTag(null)}
              className="rounded bg-shu-tint px-2 py-0.5 font-sans text-xs text-hanko"
            >
              #{tag} ✕
            </button>
          ) : null}
          {author ? (
            <button
              type="button"
              onClick={() => setAuthor(null)}
              className="rounded bg-bamboo-wash px-2 py-0.5 font-sans text-xs text-bamboo"
            >
              {author} ✕
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setTag(null);
              setAuthor(null);
              setLocalQuery("");
              setNotesOnly(false);
            }}
            className="rounded px-2 py-0.5 font-sans text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-hanko"
          >
            Clear all
          </button>
        </div>
      )}

      {ai.enabled && filtered.length > 0 ? <VaultAi slips={filtered} onOpenItem={onOpenItem} /> : null}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="lg:col-span-9">
          {mode === "tanzaku" ? (
            <div className="columns-1 gap-6 space-y-6 md:columns-2">
              {filtered.map((slip) => (
                <SlipCard key={slip.highlight.id} slip={slip} onOpenItem={onOpenItem} />
              ))}
            </div>
          ) : mode === "river" ? (
            <ol className="relative ml-2 space-y-6 border-l border-line pl-6">
              {filtered.map((slip) => (
                <li key={slip.highlight.id} className="relative">
                  <span
                    className="absolute top-1 -left-[31px] size-2.5 rounded-full bg-hanko ring-4 ring-bg"
                    aria-hidden="true"
                  />
                  <p className="kami-label text-ink-muted">
                    {new Date(slip.highlight.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <SlipCard slip={slip} onOpenItem={onOpenItem} />
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex flex-col gap-8">
              {groupByTag(filtered).map(([group, groupSlips]) => (
                <section key={group} aria-label={`Concept ${group}`}>
                  <p className="kami-label mb-3 flex items-center gap-2 text-ink-muted">
                    <span className="h-px w-8 bg-line" aria-hidden="true" />
                    {group} · {groupSlips.length}
                  </p>
                  <div className="columns-1 gap-6 space-y-6 md:columns-2">
                    {groupSlips.map((slip) => (
                      <SlipCard key={slip.highlight.id} slip={slip} onOpenItem={onOpenItem} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="kami-sheet p-8 text-center">
              <p className="font-body text-sm text-ink-muted italic">
                No slips match this filtering of the river.
              </p>
              <button
                type="button"
                onClick={() => {
                  setTag(null);
                  setAuthor(null);
                  setLocalQuery("");
                  setNotesOnly(false);
                }}
                className="mt-3 rounded-full bg-hanko px-4 py-2 font-sans text-xs font-medium text-paper hover:bg-shu"
              >
                Clear Filters
              </button>
            </div>
          ) : null}
        </div>

        {/* Curatorial sidebar */}
        <div className="flex flex-col gap-6 lg:col-span-3">
          <section className="kami-sheet space-y-4 p-5" aria-label="Thematic clusters">
            <p className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-sans text-sm font-semibold text-ink">
                <Tag className="size-[18px] text-hanko" aria-hidden="true" />
                Thematic Clusters
              </span>
              <span className="font-sans text-[11px] text-ink-muted">{tagCounts.length} Tags</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={tag === null}
                onClick={() => setTag(null)}
                className="g-chip px-3"
              >
                All <span className="g-chip-count">{slips.length}</span>
              </button>
              {tagCounts.slice(0, 10).map(([t, n]) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tag === t}
                  onClick={() => setTag(tag === t ? null : t)}
                  className="g-chip px-3"
                >
                  {t} <span className="g-chip-count">{n}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="kami-sheet space-y-4 p-5" aria-label="Voices and authors">
            <p className="flex items-center gap-2 font-sans text-sm font-semibold text-ink">
              <User className="size-[18px] text-ok" aria-hidden="true" />
              Voices &amp; Authors
            </p>
            <div className="space-y-1">
              {authorCounts.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  onClick={() => setAuthor(author === a.name ? null : a.name)}
                  className={cn(
                    "flex w-full items-center justify-between rounded p-2 text-left transition-colors hover:bg-paper-warm",
                    author === a.name && "bg-paper-warm",
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Hanko glyph={a.name.trim().charAt(0) || "K"} className="size-6 text-[11px]" />
                    <span className="flex flex-col">
                      <span className="font-sans text-xs text-ink">{a.name}</span>
                      <span className="max-w-32 truncate font-body text-[11px] text-ink-muted">
                        {a.work}
                      </span>
                    </span>
                  </span>
                  <span className="font-sans text-[11px] font-semibold text-ink-soft">
                    {a.count}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="kami-sheet space-y-3 p-5" aria-label="Weekly inking rhythm">
            <p className="font-sans text-sm font-semibold text-ink">Weekly Inking Rhythm</p>
            <InkSparkline slips={slips} />
          </section>

          <div className="space-y-2 rounded-lg bg-shu-tint p-4 text-center">
            <p className="kami-label text-hanko">Manual Transcription</p>
            <p className="font-body text-xs text-ink-soft">
              Have a physical book excerpt to immortalize onto digital washi?
            </p>
            <button
              type="button"
              onClick={onTranscribe}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-hanko px-3 py-2 font-sans text-xs font-medium text-paper shadow transition-colors hover:bg-shu"
            >
              <PenLine className="size-4" aria-hidden="true" />
              Ink New Slip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function groupByTag(slips: Slip[]): [string, Slip[]][] {
  const map = new Map<string, Slip[]>();
  for (const slip of slips) {
    const key = slip.item.tags?.[0] ?? "Unbound";
    const list = map.get(key) ?? [];
    list.push(slip);
    map.set(key, list);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}
