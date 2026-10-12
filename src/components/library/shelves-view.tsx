import { useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, Search, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import type { SitePane } from "@/components/site-header.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  SHELF_PAGE_SIZE,
  useShelfCounts,
  useShelfDetail,
  useShelfItems,
} from "@/hooks/use-shelf-queries.ts";
import { shelfPath, type ShelfDetail, type ShelfTab } from "@/lib/shelves.ts";
import { statusLabels } from "@/lib/shelf-labels.ts";
import {
  defaultStatus,
  parseStatusFilter,
  statusMeta,
  statusToApi,
  type StatusFilter,
} from "@/lib/shelf-status.ts";
import { cn } from "@/lib/utils.ts";
import { AddShelfDialog } from "@/components/library/add-shelf-dialog.tsx";
import { ShelfFolio } from "@/components/library/shelf-folio.tsx";
import { ShelfRecs } from "@/components/library/shelf-recs.tsx";
import { ShelfTile } from "@/components/library/shelf-tile.tsx";
import { useAiStatus } from "@/hooks/use-ai.ts";
import type { ShelvesSearch } from "@/lib/shelves-search.ts";

const SHELF_META: {
  id: ShelfTab;
  pane: Extract<SitePane, "movies" | "series" | "books" | "wishlist">;
  label: string;
  eyebrow: string;
}[] = [
  { id: "movie", pane: "movies", label: "Movies", eyebrow: "Movie Shelf" },
  { id: "tv", pane: "series", label: "Series", eyebrow: "Series Shelf" },
  { id: "book", pane: "books", label: "Books", eyebrow: "Book Shelf" },
  { id: "wishlist", pane: "wishlist", label: "Wishlist", eyebrow: "Wish Shelf" },
];

/** One shelf type per route — movies, series, books, or wishlist. */
export function ShelvesView({ tab, search }: { tab: ShelfTab; search: ShelvesSearch }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(() => search.q ?? "");
  const [status, setStatus] = useState<StatusFilter>(() => parseStatusFilter(search.status, tab));
  const [limit, setLimit] = useState(SHELF_PAGE_SIZE);
  const deferredQuery = useDeferredValue(query);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const ai = useAiStatus();
  const [recsFor, setRecsFor] = useState<ShelfTab | null>(null);
  const canSuggest = ai.enabled && tab !== "wishlist";
  const syncedFromUrl = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const countsQuery = useShelfCounts();
  const itemsQuery = useShelfItems({
    type: tab,
    status: statusToApi(status),
    query: deferredQuery,
    limit,
  });
  const detailQuery = useShelfDetail(tab, detailId);

  const counts = countsQuery.data ?? null;
  const items = itemsQuery.isPending && !itemsQuery.data ? null : (itemsQuery.data ?? []);
  const detail = detailId ? (detailQuery.data ?? null) : null;
  const hasMore = items != null && items.length >= limit;
  const activeMeta = SHELF_META.find((t) => t.id === tab)!;

  // One-way: URL → local state on first paint (deep links).
  useEffect(() => {
    if (syncedFromUrl.current) return;
    syncedFromUrl.current = true;
    if (typeof search.q === "string") setQuery(search.q);
    setStatus(parseStatusFilter(search.status, tab));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Other way: local state → URL (debounced for typing).
  useEffect(() => {
    if (!syncedFromUrl.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      void navigate({
        to: shelfPath(tab),
        search: {
          q: query ? query : undefined,
          // Omit the shelf's default filter from the URL.
          status: status === defaultStatus(tab) ? undefined : status,
        },
        replace: true,
      });
    }, 300);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [tab, query, status, navigate]);

  // Reset pagination / detail when the shelf type or list criteria change.
  useEffect(() => {
    setLimit(SHELF_PAGE_SIZE);
    setDetailId(null);
  }, [tab, status, deferredQuery]);

  const shelfCount = counts?.[tab] ?? null;
  // Omit the shelf's default filter from the URL.
  const listSearch: ShelvesSearch = {
    q: query ? query : undefined,
    status: status === defaultStatus(tab) ? undefined : status,
  };

  return (
    <AppShell active={activeMeta.pane} onOpenItem={() => undefined}>
      <section className="w-full bg-paper/60 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-12">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <KamiEyebrow>
                {activeMeta.eyebrow}
                <span className="size-1 rounded-full bg-hanko/40" aria-hidden="true" />
                <span className="text-bamboo">
                  {shelfCount == null ? "binding…" : `${shelfCount} kept`}
                </span>
              </KamiEyebrow>
              <h2 className="mt-2 flex flex-wrap items-center gap-3 font-display text-3xl tracking-tight text-ink">
                {activeMeta.label}
              </h2>
            </div>
            <div className="relative w-full md:w-80">
              <div className="kami-sheet flex items-center px-3 py-2.5 focus-within:ring-2 focus-within:ring-hanko/40">
                <Search className="mr-2 size-[18px] shrink-0 text-ink-muted" aria-hidden="true" />
                <label htmlFor="shelves-search" className="sr-only">
                  Search {activeMeta.label.toLowerCase()}
                </label>
                <Input
                  id="shelves-search"
                  name="shelves-search"
                  type="search"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search titles, authors…"
                  className="h-auto flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canSuggest ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRecsFor(recsFor === tab ? null : tab)}
                  aria-expanded={recsFor === tab}
                  className="shrink-0 gap-1.5 bg-surface shadow-[var(--shadow-border)]"
                >
                  <Sparkles className="size-4 text-hanko" aria-hidden="true" />
                  Suggest
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={() => setAddOpen(true)}
                className="shrink-0 bg-hanko text-white hover:bg-shu"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add to shelf
              </Button>
            </div>
          </div>

          {recsFor === tab && tab !== "wishlist" && ai.enabled ? (
            <ShelfRecs key={tab} type={tab} onClose={() => setRecsFor(null)} />
          ) : null}

          <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1">
            {statusMeta(tab).map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={status === s.id}
                onClick={() => setStatus(s.id)}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[0.25rem] px-3 py-1 font-sans text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                  status === s.id
                    ? "bg-hanko font-semibold text-white shadow-sm"
                    : "bg-surface text-ink-soft shadow-[var(--shadow-border)] hover:bg-paper-warm hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    status === s.id
                      ? "bg-white"
                      : s.id === "done"
                        ? "bg-hanko"
                        : s.id === "in_progress"
                          ? "bg-bamboo"
                          : s.id === "abandoned"
                            ? "bg-ink-muted"
                            : s.id === "to_try"
                              ? "bg-ok"
                              : "bg-line",
                  )}
                  aria-hidden="true"
                />
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
        {items == null ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="kami-sheet overflow-hidden">
                <Skeleton className="aspect-[2/3] w-full" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 && (query || status !== "all") && (shelfCount ?? 0) > 0 ? (
          <div className="kami-sheet mx-auto max-w-md p-10 text-center">
            <p className="font-display text-xl text-ink">
              {query
                ? `Nothing matches “${query}”`
                : `Nothing under “${statusMeta(tab).find((s) => s.id === status)?.label}”`}
            </p>
            <p className="mt-2 font-sans text-sm text-ink-muted">
              {query
                ? "Check the spelling, or search the whole shelf."
                : status === "in_progress"
                  ? tab === "tv"
                    ? "Tick an episode on a series and it shows up here."
                    : "Start a book or log your page and it shows up here."
                  : "Pick another filter to see the rest of your shelf."}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setQuery("");
                setStatus(status === "in_progress" && !query ? "to_try" : "all");
              }}
              className="mt-4"
            >
              {status === "in_progress" && !query
                ? `Show ${statusLabels(tab).toTry.toLowerCase()}`
                : "Show everything"}
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="kami-sheet mx-auto max-w-md p-10 text-center">
            <p className="font-display text-xl text-ink">This shelf is empty</p>
            <p className="mt-2 font-sans text-sm text-ink-muted">
              Search TMDB, Open Library, or paste a link to add something here.
            </p>
            <Button
              type="button"
              onClick={() => setAddOpen(true)}
              className="mt-4 bg-hanko text-white hover:bg-shu"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add your first item
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <ShelfTile
                  key={item.id}
                  item={item}
                  tab={tab}
                  listSearch={listSearch}
                  onOpen={() => setDetailId(item.id)}
                />
              ))}
            </div>
            {hasMore ? (
              <div className="mt-8 flex justify-center">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={itemsQuery.isFetching}
                  onClick={() => setLimit((n) => n + SHELF_PAGE_SIZE)}
                >
                  {itemsQuery.isFetching ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Show more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Dialog open={detailId != null} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto overscroll-contain sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-balance">
              {detail ? detailTitle(detail) : "Loading…"}
            </DialogTitle>
          </DialogHeader>
          {detail == null ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : (
            <ShelfFolio detail={detail} onClose={() => setDetailId(null)} />
          )}
        </DialogContent>
      </Dialog>

      <AddShelfDialog
        open={addOpen}
        initialTab={tab}
        lockType
        onClose={() => setAddOpen(false)}
        onAdded={() => setAddOpen(false)}
      />
    </AppShell>
  );
}

function detailTitle(d: ShelfDetail): string {
  return d.item.title;
}
