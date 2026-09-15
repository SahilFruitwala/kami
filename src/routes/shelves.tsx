import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Clapperboard, Search, Tv, BookOpen, Gift } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { Hanko, KamiEyebrow, WashiTag } from "@/components/kami.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  getShelfCounts,
  getShelfItem,
  listShelfItems,
  SHELF_TABS,
  type ShelfCard,
  type ShelfDetail,
  type ShelfTab,
} from "@/lib/shelves-fns.ts";
import { cn } from "@/lib/utils.ts";

type ShelvesSearch = {
  tab?: string;
  q?: string;
  status?: string;
};

const TAB_META: { id: ShelfTab; label: string; icon: typeof Clapperboard }[] = [
  { id: "movie", label: "Movies", icon: Clapperboard },
  { id: "tv", label: "TV Shows", icon: Tv },
  { id: "book", label: "Books", icon: BookOpen },
  { id: "wishlist", label: "Wishlist", icon: Gift },
];

const STATUS_META = [
  { id: undefined, label: "All" },
  { id: "to_try", label: "To try" },
  { id: "done", label: "Done" },
  { id: "abandoned", label: "Abandoned" },
] as const;

function isShelfTab(v: unknown): v is ShelfTab {
  return typeof v === "string" && (SHELF_TABS as readonly string[]).includes(v);
}

function isShelfStatus(v: unknown): v is "to_try" | "done" | "abandoned" {
  return v === "to_try" || v === "done" || v === "abandoned";
}

export const Route = createFileRoute("/shelves")({
  validateSearch: (search: Record<string, unknown>): ShelvesSearch => ({
    tab: typeof search.tab === "string" && search.tab.length > 0 ? search.tab : undefined,
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    status: typeof search.status === "string" && search.status.length > 0 ? search.status : undefined,
  }),
  component: ShelvesPage,
});

function ShelvesPage() {
  return <Shelves />;
}

function Shelves() {
  const navigate = Route.useNavigate();
  const search = Route.useSearch();
  const [tab, setTab] = useState<ShelfTab>(() => (isShelfTab(search.tab) ? search.tab : "movie"));
  const [query, setQuery] = useState(() => search.q ?? "");
  const [status, setStatus] = useState<"to_try" | "done" | "abandoned" | undefined>(() =>
    isShelfStatus(search.status) ? search.status : undefined,
  );
  const deferredQuery = useDeferredValue(query);
  const [counts, setCounts] = useState<Record<ShelfTab, number> | null>(null);
  const [items, setItems] = useState<ShelfCard[] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShelfDetail | null>(null);
  const syncedFromUrl = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    void getShelfCounts().then((c) => {
      if (live) setCounts(c);
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  // One-way: URL → local state on first paint (deep links).
  useEffect(() => {
    if (syncedFromUrl.current) return;
    syncedFromUrl.current = true;
    if (isShelfTab(search.tab)) setTab(search.tab);
    if (typeof search.q === "string") setQuery(search.q);
    if (isShelfStatus(search.status)) setStatus(search.status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Other way: local state → URL (debounced for typing).
  useEffect(() => {
    if (!syncedFromUrl.current) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      void navigate({
        search: {
          tab: tab === "movie" ? undefined : tab,
          q: query ? query : undefined,
          status: status ?? undefined,
        },
        replace: true,
      });
    }, 300);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [tab, query, status, navigate]);

  useEffect(() => {
    let live = true;
    setItems(null);
    void listShelfItems({ data: { type: tab, status, query: deferredQuery, limit: 120, offset: 0 } })
      .then((rows) => {
        if (live) setItems(rows);
      })
      .catch(() => {
        if (live) setItems([]);
      });
    return () => {
      live = false;
    };
  }, [tab, status, deferredQuery]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    let live = true;
    setDetail(null);
    void getShelfItem({ data: { type: tab, id: detailId } })
      .then((d) => {
        if (live) setDetail(d);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [detailId, tab]);

  const total = counts ? counts.movie + counts.tv + counts.book + counts.wishlist : null;

  return (
    <AppShell active="shelves" onOpenItem={() => undefined}>
      <section className="w-full bg-paper/60 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-12">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <KamiEyebrow>
                Shelf Ledger
                <span className="size-1 rounded-full bg-hanko/40" aria-hidden="true" />
                <span className="text-bamboo">
                  {total == null ? "binding…" : `${total} kept`}
                </span>
              </KamiEyebrow>
              <h2 className="mt-2 flex flex-wrap items-center gap-3 font-display text-3xl tracking-tight text-ink">
                Shelves
              </h2>
            </div>
            <div className="relative w-full md:w-80">
              <div className="kami-sheet flex items-center px-3 py-2.5 focus-within:ring-2 focus-within:ring-hanko/40">
                <Search className="mr-2 size-[18px] shrink-0 text-ink-muted" aria-hidden="true" />
                <label htmlFor="shelves-search" className="sr-only">
                  Search shelves
                </label>
                <Input
                  id="shelves-search"
                  type="search"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search titles, authors…"
                  className="h-auto flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Shelves">
              {TAB_META.map((t) => {
                const Icon = t.icon;
                const n = counts?.[t.id];
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    onClick={() => {
                      setTab(t.id);
                      setDetailId(null);
                    }}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-[0.25rem] px-3 py-1.5 font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                      tab === t.id
                        ? "bg-paper-warm font-semibold text-ink"
                        : "font-medium text-ink-muted hover:text-ink",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {t.label}
                    {n != null ? (
                      <span className="rounded-full bg-bamboo-wash px-1.5 py-0.5 text-[10px] font-semibold text-bamboo tabular-nums">
                        {n}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              {STATUS_META.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  aria-pressed={status === s.id}
                  onClick={() => setStatus(s.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-[0.25rem] px-3 py-1 font-sans text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                    status === s.id
                      ? "bg-paper-warm font-semibold text-ink"
                      : "bg-surface text-ink-soft hover:bg-paper-warm",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      s.id === "done" ? "bg-hanko" : s.id === "to_try" ? "bg-ok" : "bg-line",
                    )}
                    aria-hidden="true"
                  />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-12">
        {items == null ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
        ) : items.length === 0 ? (
          <div className="kami-sheet mx-auto max-w-md p-10 text-center">
            <p className="font-display text-xl text-ink">This shelf is empty</p>
            <p className="mt-2 font-sans text-sm text-ink-muted">
              Nothing here matches. Import your shelf data or try another search.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setDetailId(item.id)}
                className="kami-sheet group overflow-hidden text-left transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40 hover:-translate-y-0.5"
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-paper-warm">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center font-display text-4xl text-ink-faint">
                      {item.title.charAt(0)}
                    </div>
                  )}
                  {item.status === "done" ? (
                    <span className="absolute top-2 right-2">
                      <Hanko glyph="✓" title="Done" />
                    </span>
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 font-display text-[15px] leading-snug font-medium text-ink">
                    {item.title}
                  </p>
                  {item.subtitle ? (
                    <p className="mt-1 line-clamp-1 font-sans text-xs text-ink-muted">{item.subtitle}</p>
                  ) : null}
                  <div className="mt-2">
                    <WashiTag tone={item.status === "done" ? "vermilion" : "paper"}>
                      {item.status === "to_try" ? "To try" : item.status === "done" ? "Done" : "Abandoned"}
                    </WashiTag>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={detailId != null} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">
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
            <ShelfFolio detail={detail} />
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function detailTitle(d: ShelfDetail): string {
  return d.item.title;
}

function ShelfFolio({ detail }: { detail: ShelfDetail }) {
  const genres = detail.type === "wishlist" ? [] : detail.genres;
  const overview =
    detail.type === "movie" || detail.type === "tv" || detail.type === "book"
      ? detail.item.overview
      : detail.item.description;
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="w-24 shrink-0 overflow-hidden rounded-[0.25rem] bg-paper-warm">
          {detail.item.imageUrl ? (
            <img src={detail.item.imageUrl} alt="" className="aspect-[2/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center font-display text-3xl text-ink-faint">
              {detail.item.title.charAt(0)}
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <WashiTag tone={detail.item.status === "done" ? "vermilion" : "paper"}>
              {detail.item.status === "to_try" ? "To try" : detail.item.status === "done" ? "Done" : "Abandoned"}
            </WashiTag>
            {genres.map((g) => (
              <WashiTag key={g} tone="bamboo">
                {g}
              </WashiTag>
            ))}
          </div>
          <dl className="space-y-1 font-sans text-xs text-ink-muted">
            {detail.type === "movie" && detail.item.releaseYear ? (
              <div className="flex gap-2"><dt>Year</dt><dd className="text-ink">{detail.item.releaseYear}</dd></div>
            ) : null}
            {detail.type === "tv" ? (
              <>
                {detail.item.releaseYear ? (
                  <div className="flex gap-2"><dt>Year</dt><dd className="text-ink">{detail.item.releaseYear}</dd></div>
                ) : null}
                <div className="flex gap-2">
                  <dt>Episodes</dt>
                  <dd className="text-ink">
                    {detail.item.episodesWatched ?? 0}
                    {detail.item.totalEpisodes ? ` / ${detail.item.totalEpisodes}` : ` ticked (${detail.episodesTicked})`}
                    {detail.item.lastEpisode ? ` · ${detail.item.lastEpisode}` : ""}
                  </dd>
                </div>
              </>
            ) : null}
            {detail.type === "book" ? (
              <>
                {detail.item.author ? (
                  <div className="flex gap-2"><dt>Author</dt><dd className="text-ink">{detail.item.author}</dd></div>
                ) : null}
                {detail.item.publishYear ? (
                  <div className="flex gap-2"><dt>Published</dt><dd className="text-ink">{detail.item.publishYear}</dd></div>
                ) : null}
              </>
            ) : null}
            {detail.type === "wishlist" ? (
              <>
                {detail.item.price ? (
                  <div className="flex gap-2"><dt>Price</dt><dd className="text-ink">{detail.item.price}</dd></div>
                ) : null}
                {detail.item.source ? (
                  <div className="flex gap-2"><dt>Source</dt><dd className="text-ink">{detail.item.source}</dd></div>
                ) : null}
              </>
            ) : null}
            {detail.item.link ? (
              <div>
                <a
                  href={detail.item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-accent underline underline-offset-2"
                >
                  Open reference
                </a>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
      {overview ? (
        <p className="font-serif text-[15px] leading-relaxed text-ink-soft">{overview}</p>
      ) : null}
      {detail.item.notes ? (
        <div className="rounded-[0.25rem] bg-paper-warm p-3">
          <p className="kami-label text-ink-muted">Marginalia</p>
          <p className="mt-1 font-serif text-sm text-ink italic">{detail.item.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
