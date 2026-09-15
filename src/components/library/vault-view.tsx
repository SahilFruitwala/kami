import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Copy,
  Download,
  Droplets,
  Heart,
  Network,
  LayoutGrid,
  PenLine,
  Search,
  Tag,
  User,
  Waves,
} from "lucide-react";
import { toast } from "sonner";
import { Hanko } from "@/components/kami.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { Highlight, LibraryItem } from "@/lib/store.ts";
import { useLibraryStore } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

type Slip = { item: LibraryItem; highlight: Highlight };
type VaultViewMode = "tanzaku" | "river" | "web";
type VaultSort = "recent" | "linked" | "source";

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
  const [mode, setMode] = useState<VaultViewMode>(initialMode === "river" || initialMode === "web" ? initialMode : "tanzaku");
  const [sort, setSort] = useState<VaultSort>(initialSort === "linked" || initialSort === "source" ? initialSort : "recent");
  const [tag, setTag] = useState<string | null>(initialTag ?? null);
  const [author, setAuthor] = useState<string | null>(initialAuthor ?? null);
  const [localQuery, setLocalQuery] = useState(initialLocalQuery ?? "");
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
  }, [slips, tag, author, q, sort]);

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
          className="mt-2 rounded-[0.25rem] bg-hanko px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-sm hover:bg-shu"
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
        Showing {filtered.length} of {slips.length} slips{tag ? ` tagged #${tag}` : ""}{author ? ` by ${author}` : ""}{q ? ` matching “${localQuery || query}”` : ""}
      </p>

      {(tag || author || localQuery) && (
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
            }}
            className="rounded px-2 py-0.5 font-sans text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-hanko"
          >
            Clear all
          </button>
        </div>
      )}

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
                }}
                className="mt-3 rounded-[0.25rem] bg-hanko px-4 py-2 font-sans text-xs font-semibold text-white shadow-sm hover:bg-shu"
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
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTag(null)}
                className={cn(
                  "flex items-center gap-1 rounded px-2.5 py-1 font-sans text-xs",
                  tag === null
                    ? "bg-hanko text-white shadow-sm"
                    : "bg-bg text-ink transition-colors hover:bg-paper-warm",
                )}
              >
                All Slips <span className="text-[10px] opacity-80">({slips.length})</span>
              </button>
              {tagCounts.slice(0, 10).map(([t, n]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag(tag === t ? null : t)}
                  className={cn(
                    "flex items-center gap-1 rounded px-2.5 py-1 font-sans text-xs",
                    tag === t
                      ? "bg-hanko text-white shadow-sm"
                      : "bg-bg text-ink transition-colors hover:bg-paper-warm",
                  )}
                >
                  {t} <span className="text-[11px] text-ink-muted">({n})</span>
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
              className="flex w-full items-center justify-center gap-1.5 rounded bg-hanko px-3 py-2 font-sans text-xs font-medium text-white shadow transition-colors hover:bg-shu"
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

function MetricDot({
  color,
  label,
  strong,
}: {
  color: string;
  label: string;
  strong?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 shadow-[var(--shadow-border)]">
      <span className={cn("size-1.5 rounded-full", color)} aria-hidden="true" />
      <span className={cn("font-sans text-xs", strong ? "font-semibold text-ink" : "text-ink-soft")}>
        {label}
      </span>
    </span>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1 font-sans text-xs transition-colors",
        active ? "bg-surface text-hanko shadow-sm" : "text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded px-2.5 py-1 font-sans text-[11px] whitespace-nowrap transition-colors",
        active ? "bg-paper-warm text-ink" : "text-ink-soft hover:bg-paper-warm",
      )}
    >
      {children}
    </button>
  );
}

function SlipCard({
  slip,
  onOpenItem,
}: {
  slip: Slip;
  onOpenItem: (item: LibraryItem) => void;
}) {
  const { item, highlight } = slip;
  const setFavorited = useLibraryStore((s) => s.setFavorited);
  const favorited = item.favorited;

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <article className="kami-sheet group relative flex break-inside-avoid flex-col justify-between p-6 transition-shadow hover:shadow-[var(--shadow-border-hover)]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="kami-label text-ink-muted">
            Inked {new Date(highlight.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          <Hanko glyph={(item.author || item.siteName || "K").trim().charAt(0) || "K"} square className="size-7 text-[11px]" />
        </div>
        <blockquote className="font-display text-lg leading-snug font-normal break-words text-ink italic">
          “{highlight.text}”
        </blockquote>
        <div>
          <p className="font-sans text-sm font-medium text-ok">
            — {item.author || item.siteName || "Unknown hand"},{" "}
            <span className="font-normal italic">{item.title}</span>
          </p>
        </div>
        {highlight.note ? (
          <div className="flex items-start gap-2.5 rounded-md bg-bg/70 px-3 py-2.5">
            <PenLine className="mt-0.5 size-[18px] shrink-0 text-hanko" aria-hidden="true" />
            <div>
              <p className="kami-label text-ink-muted">Personal Marginalia</p>
              <p className="font-body text-sm text-ink italic">{highlight.note}</p>
            </div>
          </div>
        ) : null}
        {(item.tags ?? []).length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {(item.tags ?? []).slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded bg-shu-tint px-2 py-0.5 font-sans text-[11px] text-hanko"
              >
                #{t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="-mx-6 -mb-6 mt-5 flex items-center justify-between rounded-b-[0.25rem] bg-bg/60 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <SlipAction onClick={() => void copyText(highlight.text, "Passage copied")}>
            <Copy className="size-4" aria-hidden="true" />
            Copy
          </SlipAction>
          <SlipAction onClick={() => onOpenItem(item)}>
            <BookOpen className="size-4" aria-hidden="true" />
            Read
          </SlipAction>
          <SlipAction
            onClick={() =>
              void copyText(
                `“${highlight.text}” — ${item.author || item.siteName || "Unknown"}, ${item.title}`,
                "Citation copied for your journal",
              )
            }
          >
            <PenLine className="size-4" aria-hidden="true" />
            Cite
          </SlipAction>
        </div>
        <button
          type="button"
          onClick={() => {
            setFavorited(item.id, !favorited);
            toast.success(favorited ? "Removed from Favorites" : "Added to Favorites");
          }}
          aria-pressed={favorited}
          aria-label={favorited ? "Remove from Favorites" : "Add to Favorites"}
          title={favorited ? "Remove from Favorites" : "Add to Favorites"}
          className={cn(
            "transition-transform hover:scale-110",
            favorited ? "text-hanko" : "text-ink-muted hover:text-hanko",
          )}
        >
          <Heart className={cn("size-[18px]", favorited && "fill-hanko")} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function SlipAction({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 font-sans text-[11px] text-ink-accent transition-colors hover:text-hanko"
    >
      {children}
    </button>
  );
}

function weekdayLabel(daysAgo: number): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
    new Date(Date.now() - daysAgo * 86_400_000),
  );
}

function InkSparkline({ slips }: { slips: Slip[] }) {
  const bins = useMemo(() => {
    const counts = new Array(7).fill(0) as number[];
    const now = new Date();
    for (const { highlight } of slips) {
      const d = Math.floor((now.getTime() - highlight.createdAt) / 86_400_000);
      if (d >= 0 && d < 7) counts[6 - d] += 1;
    }
    return counts;
  }, [slips]);
  const max = Math.max(1, ...bins);
  const pts = bins
    .map((v, i) => `${8 + (i / 6) * 184},${34 - (v / max) * 26}`)
    .join(" ");
  return (
    <div className="pt-2">
      <svg viewBox="0 0 200 40" className="h-12 w-full overflow-visible text-hanko" fill="none" aria-hidden="true">
        <path d={`M${pts.replaceAll(" ", " L")}`} stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        <circle cx="192" cy={34 - (bins[6] / max) * 26} r="4" className="fill-hanko" />
      </svg>
      <div className="mt-1 flex justify-between font-sans text-[10px] tabular-nums text-ink-muted">
        <span>{weekdayLabel(6)}</span>
        <span>{weekdayLabel(4)}</span>
        <span>{weekdayLabel(2)}</span>
        <span>Today</span>
      </div>
      <p className="mt-2 flex items-center gap-1.5 font-body text-xs text-ink-muted">
        <Droplets className="size-3.5 text-ok" aria-hidden="true" />
        Fresh ink settles most on quiet mornings.
      </p>
    </div>
  );
}
