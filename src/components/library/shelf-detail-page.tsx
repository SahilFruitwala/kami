import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  Check,
  CircleSlash,
  RotateCcw,
  ExternalLink,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { Hanko, KamiEyebrow, WashiTag } from "@/components/kami.tsx";
import { BookProgress } from "@/components/library/book-progress.tsx";
import { EpisodeTracker } from "@/components/library/episode-tracker.tsx";
import { WatchWhere } from "@/components/library/watch-where.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useShelfItemActions } from "@/hooks/use-shelf-item-actions.ts";
import { statusText } from "@/lib/shelf-labels.ts";
import { useShelfDetail } from "@/hooks/use-shelf-queries.ts";
import { cn } from "@/lib/utils.ts";
import { shelfPath, type ShelfDetail, type ShelfTab } from "@/lib/shelves.ts";
import type { ShelvesSearch } from "@/lib/shelves-search.ts";

type DetailTab = Exclude<ShelfTab, "wishlist">;

const TAB_META: Record<
  DetailTab,
  { pane: "movies" | "series" | "books"; label: string; eyebrow: string }
> = {
  movie: { pane: "movies", label: "Movies", eyebrow: "Movie Shelf" },
  tv: { pane: "series", label: "Series", eyebrow: "Series Shelf" },
  book: { pane: "books", label: "Books", eyebrow: "Book Shelf" },
};

function formatDate(v: Date | string | number | null | undefined): string | null {
  if (v == null) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Full page for one movie, series, or book — deep-linkable from anywhere. */
export function ShelfDetailPage({
  tab,
  id,
  listSearch,
}: {
  tab: DetailTab;
  id: string;
  /** The shelf list's filters when it was opened, so going back lands on the same tab. */
  listSearch: ShelvesSearch;
}) {
  const meta = TAB_META[tab];
  const query = useShelfDetail(tab, id);
  const data = query.data ?? null;
  const detail = data && data.type !== "wishlist" ? data : null;

  return (
    <AppShell active={meta.pane} onOpenItem={() => undefined}>
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-16 sm:px-6 lg:px-12">
        <Link
          to={shelfPath(tab)}
          search={listSearch}
          className="inline-flex min-h-11 items-center gap-1.5 font-sans text-xs text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {meta.label}
        </Link>

        {query.isPending ? (
          <DetailSkeleton />
        ) : detail == null ? (
          <div className="kami-sheet mx-auto mt-8 max-w-md p-10 text-center">
            <title>Not on your shelf · Kami</title>
            <p className="font-display text-xl text-ink">Not on your shelf</p>
            <p className="mt-2 font-sans text-sm text-ink-muted">
              This {tab === "tv" ? "series" : tab} was removed, or the link is wrong.
            </p>
            <Button asChild className="mt-4 bg-hanko text-paper hover:bg-shu">
              <Link to={shelfPath(tab)} search={listSearch}>
                Back to {meta.label.toLowerCase()}
              </Link>
            </Button>
          </div>
        ) : (
          <DetailBody detail={detail} tab={tab} eyebrow={meta.eyebrow} listSearch={listSearch} />
        )}
      </div>
    </AppShell>
  );
}

function DetailBody({
  detail,
  tab,
  eyebrow,
  listSearch,
}: {
  detail: Exclude<ShelfDetail, { type: "wishlist" }>;
  tab: DetailTab;
  eyebrow: string;
  listSearch: ShelvesSearch;
}) {
  const navigate = useNavigate();
  const { item } = detail;
  const { busy, labels, setDone, startReading, setAbandoned, remove } = useShelfItemActions(
    detail,
    () => {
      void navigate({ to: shelfPath(tab), search: listSearch, replace: true });
    },
  );
  const isDone = item.status === "done";
  const isActive = item.status === "in_progress";
  const isDropped = item.status === "abandoned";
  const added = formatDate(item.createdAt);
  const finished = formatDate(item.completedAt);
  const link = httpUrl(item.link);
  const year = detail.type === "book" ? detail.item.publishYear : detail.item.releaseYear;
  const byline =
    detail.type === "book"
      ? [detail.item.author, year].filter(Boolean).join(" · ")
      : year
        ? String(year)
        : "";

  return (
    <article className="mt-4 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
      <title>{`${item.title} · Kami`}</title>

      <div className="mx-auto w-full max-w-[16rem] lg:sticky lg:top-6 lg:self-start">
        <div className="poster-frame relative overflow-hidden rounded-[4px] shadow-[var(--g-shadow-lifted)]">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt={`Cover of ${item.title}`}
              width={512}
              height={768}
              fetchPriority="high"
              className={cn(
                "aspect-[2/3] w-full object-cover transition-[filter,opacity] duration-300",
                isDropped && "opacity-60 grayscale",
              )}
            />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center font-display text-7xl text-ink-faint">
              {item.title.charAt(0)}
            </div>
          )}
          {isDone ? (
            <span className="absolute top-3 right-3 z-[2]">
              <Hanko glyph="✓" title={labels.done} className="size-9 text-base" />
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 space-y-8">
        <header className="space-y-3">
          <KamiEyebrow>
            {eyebrow}
            <span className="size-1 rounded-full bg-hanko/40" aria-hidden="true" />
            <span className={isDone ? "text-ink" : isDropped ? "text-ink-muted" : "text-ok"}>
              {statusText(labels, item.status)}
            </span>
          </KamiEyebrow>
          <h1 className="g-h1-topic text-balance text-ink">
            {item.title}
          </h1>
          {byline ? <p className="font-display text-lg text-ink-soft italic">{byline}</p> : null}
          {detail.genres.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {detail.genres.map((g) => (
                <WashiTag key={g} tone="bamboo">
                  {g}
                </WashiTag>
              ))}
            </div>
          ) : null}
        </header>

        <div className="flex flex-wrap gap-2">
          {isDropped ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void setAbandoned(false)}
              className="bg-hanko text-paper hover:bg-shu"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="size-4" aria-hidden="true" />
              )}
              {detail.type === "book" ? "Resume reading" : "Resume watching"}
            </Button>
          ) : (
            <>
              {!isDone && !isActive && detail.type === "book" ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void startReading()}
                >
                  <BookOpen className="size-4" aria-hidden="true" />
                  Start reading
                </Button>
              ) : null}
              {isDone || isActive ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void setDone(false)}
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {isActive && detail.type === "tv" ? "Clear progress" : labels.markTry}
                </Button>
              ) : null}
              {isDone ? null : (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void setDone(true)}
                  className="bg-hanko text-paper hover:bg-shu"
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="size-4" aria-hidden="true" />
                  )}
                  {labels.markDone}
                </Button>
              )}
            </>
          )}
          {link ? (
            <Button asChild variant="secondary">
              <a href={link} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                Open reference
              </a>
            </Button>
          ) : null}
          {!isDone && !isDropped ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void setAbandoned(true)}
              className="text-ink-muted hover:text-ink"
            >
              <CircleSlash className="size-4" aria-hidden="true" />
              {detail.type === "book" ? "Abandon book" : "Drop series"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void remove()}
            className="text-hanko hover:bg-hanko/10 hover:text-shu"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Remove
          </Button>
        </div>

        {item.overview ? (
          <section aria-label="Overview">
            <p className="max-w-prose font-display text-[17px] leading-relaxed text-ink-soft text-pretty">
              {item.overview}
            </p>
          </section>
        ) : null}

        {detail.type !== "book" && detail.item.tmdbId != null ? (
          <section aria-labelledby="where-heading">
            <h2 id="where-heading" className="kami-label text-ink-muted">
              Where to watch
            </h2>
            <WatchWhere tmdbId={String(detail.item.tmdbId)} kind={detail.type} />
          </section>
        ) : null}

        {item.notes ? (
          <section className="rounded-lg border-l-2 border-hanko/40 bg-paper-warm p-4">
            <h2 className="kami-label text-ink-muted">Marginalia</h2>
            <p className="mt-1.5 font-display text-base text-ink italic text-pretty">{item.notes}</p>
          </section>
        ) : null}

        {detail.type === "book" ? (
          <BookProgress
            key={`${detail.item.id}:${detail.item.progressPercent}:${detail.item.currentPage}:${detail.item.pageCount}`}
            id={detail.item.id}
            currentPage={detail.item.currentPage}
            pageCount={detail.item.pageCount}
            percent={detail.item.progressPercent}
          />
        ) : null}

        {detail.type === "tv" ? (
          <section aria-labelledby="episodes-heading" className="kami-sheet p-4 sm:p-5">
            <h2 id="episodes-heading" className="kami-label mb-3 text-ink-muted">
              Episodes
              <span className="ml-2 font-normal tracking-normal normal-case tabular-nums">
                {detail.item.episodesWatched ?? 0}
                {detail.item.totalEpisodes ? ` / ${detail.item.totalEpisodes}` : ""} watched
                {detail.item.lastEpisode ? ` · Last ${detail.item.lastEpisode}` : ""}
              </span>
            </h2>
            <EpisodeTracker itemId={detail.item.id} />
          </section>
        ) : null}

        {added || finished ? (
          <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-4 font-sans text-xs text-ink-muted">
            {added ? (
              <div>
                <dt className="kami-label">Added</dt>
                <dd className="mt-0.5 text-sm text-ink">{added}</dd>
              </div>
            ) : null}
            {finished && isDone ? (
              <div>
                <dt className="kami-label">{labels.done}</dt>
                <dd className="mt-0.5 text-sm text-ink">{finished}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div
      className="mt-4 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="mx-auto aspect-[2/3] w-full max-w-[16rem]" />
      <div className="space-y-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-6 h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
