import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Clock3, Highlighter, PenLine } from "lucide-react";
import { Hanko, RhythmBars, WashiTag } from "@/components/kami.tsx";
import type { LibraryItem } from "@/lib/store.ts";
import { useLibraryStore } from "@/lib/store.ts";

/** Desk-wide counts shared by the header, home, and footer. */
export function useDeskStats() {
  const library = useLibraryStore((s) => s.library);
  return useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    return {
      total: library.length,
      inbox: library.filter((row) => !row.archived).length,
      archived: library.filter((row) => row.archived).length,
      vaultCount: library.reduce((n, row) => n + (row.highlights?.length ?? 0), 0),
      minutesToday: library
        .filter((row) => row.savedAt >= startMs)
        .reduce((n, row) => n + (row.readingMinutes || 0), 0),
    };
  }, [library]);
}

/** Most recent unarchived work. */
export function useDeskHeroItem(): LibraryItem | null {
  const library = useLibraryStore((s) => s.library);
  return useMemo(() => {
    const sorted = [...library].sort((a, b) => b.savedAt - a.savedAt);
    return sorted.find((row) => !row.archived) ?? sorted[0] ?? null;
  }, [library]);
}

/** Hero — Currently on Desk. */
export function DeskHero({
  item,
  onOpen,
}: {
  item: LibraryItem;
  onOpen: (item: LibraryItem) => void;
}) {
  const glyph = (item.siteName || item.title || "K").trim().charAt(0) || "K";
  const marginalia = (item.highlights?.length ?? 0) + (item.note ? 1 : 0);
  return (
    <div className="kami-sheet-raised group relative overflow-hidden p-8 md:p-10">
      <div
        className="absolute top-0 right-10 z-20 flex h-28 w-6 flex-col items-center justify-end bg-hanko pb-2.5 shadow-md transition-[height] duration-300 group-hover:h-32"
        aria-hidden="true"
      >
        <span className="size-1.5 rounded-full bg-white/80" />
        <span className="absolute -bottom-2.5 left-0 size-0 border-x-[12px] border-b-[10px] border-x-hanko border-b-transparent" />
      </div>
      <div
        className="pointer-events-none absolute -right-20 -bottom-20 size-80 rounded-full bg-hanko/10 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative z-10">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <WashiTag tone="vermilion">Currently On Desk</WashiTag>
          <span className="font-sans text-[11px] tabular-nums text-ink-muted">
            {item.source === "x" ? "X" : item.siteName || "Article"} · {item.readingMinutes}&nbsp;min
          </span>
        </div>
        <h2 className="mb-2 font-display text-2xl leading-tight tracking-tight text-ink text-balance md:text-3xl">
          {item.title}
        </h2>
        {item.excerpt ? (
          <p className="mb-6 line-clamp-2 max-w-2xl font-body text-base text-ink-soft">
            {item.author ? `${item.author} — ` : ""}
            {item.excerpt}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="inline-flex items-center gap-2 rounded-[0.25rem] bg-hanko px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-sm transition-all hover:bg-shu active:translate-y-px"
          >
            <BookOpen className="size-[18px]" aria-hidden="true" />
            Continue Reading
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-[0.25rem] bg-paper-warm px-4 py-2.5 font-sans text-sm text-ink-soft">
            <PenLine className="size-[18px]" aria-hidden="true" />
            {marginalia} Inked Marginalia
          </span>
          <Hanko glyph={glyph} square className="ml-auto size-8 text-sm" title={item.siteName} />
        </div>
      </div>
    </div>
  );
}

export function ReadingRhythmCard() {
  const library = useLibraryStore((s) => s.library);
  const { minutesToday } = useDeskStats();
  const rhythm = useMemo(() => {
    const days: { value: number; label: string }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      const value = library.filter(
        (row) => row.savedAt >= start.getTime() && row.savedAt <= end.getTime(),
      ).length;
      days.push({
        value,
        label: new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(d),
      });
    }
    return days;
  }, [library]);

  return (
    <section className="kami-sheet p-6" aria-label="Reading rhythm">
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 font-sans text-sm font-semibold text-ink">
          <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
          Reading Rhythm
        </p>
        <span className="rounded-[0.25rem] bg-bamboo-wash px-2 py-0.5 font-sans text-[11px] font-semibold text-bamboo">
          {library.length} bound
        </span>
      </div>
      <div className="rounded-[0.25rem] bg-bg/70 p-4">
        <RhythmBars
          values={rhythm.map((d) => d.value)}
          activeIndex={6}
          labels={rhythm.map((d) => d.label)}
        />
      </div>
      <p className="mt-4 font-body text-xs leading-relaxed text-ink-muted">
        Bound works settle here like sheets on a desk —{" "}
        <strong className="text-ink">{minutesToday} mins</strong> gathered today.
      </p>
    </section>
  );
}

export function RecentPassagesCard({
  onOpenItem,
  hero,
}: {
  onOpenItem: (item: LibraryItem) => void;
  hero: LibraryItem | null;
}) {
  const library = useLibraryStore((s) => s.library);
  const recentPassages = useMemo(
    () =>
      library
        .flatMap((row) =>
          (row.highlights ?? []).map((h) => ({ item: row, highlight: h })),
        )
        .sort((a, b) => b.highlight.createdAt - a.highlight.createdAt)
        .slice(0, 2),
    [library],
  );

  return (
    <section className="kami-sheet p-6" aria-label="Recent inked passages">
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 font-sans text-sm font-semibold text-ink">
          <Highlighter className="size-[18px] text-hanko" aria-hidden="true" />
          Recent Inked Passages
        </p>
        <Link
          to="/vault"
          className="font-sans text-xs font-medium text-hanko hover:underline"
        >
          View Vault →
        </Link>
      </div>
      {recentPassages.length === 0 ? (
        <p className="font-body text-sm text-ink-muted italic">
          Select a passage in the reader to ink it onto washi.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {recentPassages.map(({ item, highlight }) => (
            <button
              key={highlight.id}
              type="button"
              onClick={() => onOpenItem(item)}
              className="rounded-[0.25rem] border-l-2 border-hanko bg-bg/70 p-4 text-left transition-colors hover:bg-paper-warm"
            >
              <p className="font-body text-sm text-ink italic">“{highlight.text}”</p>
              <p className="mt-2 flex items-center justify-between font-sans text-[11px] text-ink-muted">
                <span className="truncate">{item.title}</span>
              </p>
            </button>
          ))}
        </div>
      )}
      {hero ? (
        <button
          type="button"
          onClick={() => onOpenItem(hero)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-[0.25rem] bg-paper-warm py-2.5 font-sans text-xs font-medium text-ink transition-colors hover:bg-line"
        >
          <PenLine className="size-4" aria-hidden="true" />
          Ink a New Passage
        </button>
      ) : null}
    </section>
  );
}

export function FoldersCard() {
  const library = useLibraryStore((s) => s.library);
  const folders = useLibraryStore((s) => s.folders);

  return (
    <section className="kami-sheet p-6" aria-label="Folders and slipcases">
      <p className="kami-label mb-3 text-ink-muted">Folders &amp; Slipcases</p>
      <div className="flex flex-col gap-1.5 font-sans text-sm">
        {folders.length === 0 ? (
          <p className="px-3 py-2 font-body text-sm text-ink-muted italic">
            No slipcases yet — file works into folders from the reader.
          </p>
        ) : (
          folders.map((folder) => {
            const n = library.filter((row) => row.folderId === folder.id).length;
            return (
              <Link
                key={folder.id}
                to="/library"
                search={{ folder: folder.id }}
                className="flex items-center justify-between rounded-[0.25rem] px-3 py-2 text-ink-soft transition-colors hover:bg-paper-warm hover:text-ink"
              >
                <span className="flex items-center gap-2.5">
                  <BookOpen className="size-[18px] text-ink-muted" aria-hidden="true" />
                  {folder.name}
                </span>
                <span className="font-sans text-[11px] text-ink-muted">{n} works</span>
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}

export function SiteFooter() {
  const { inbox, vaultCount } = useDeskStats();
  return (
    <footer className="w-full bg-paper py-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:px-6 md:flex-row lg:px-12">
        <div className="flex items-center gap-3">
          <span
            className="kami-hanko flex size-7 items-center justify-center rounded-[0.25rem] font-display text-sm font-bold"
            aria-hidden="true"
          >
            K
          </span>
          <p className="font-body text-sm text-ink-soft">
            © Kami Sanctuary. Mindful archival reading and contemplative journaling.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <Link
            to="/settings"
            className="font-sans text-xs text-ink-muted hover:text-hanko hover:underline"
          >
            Settings
          </Link>
          <span className="flex items-center gap-1.5 font-sans text-xs text-ink-muted">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {inbox} on the desk
          </span>
          {vaultCount > 0 ? (
            <span className="flex items-center gap-1.5 font-sans text-xs text-ink-muted">
              <Highlighter className="size-3.5" aria-hidden="true" />
              {vaultCount} inked
            </span>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
