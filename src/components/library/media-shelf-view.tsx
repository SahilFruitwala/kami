import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type CSSProperties } from "react";
import {
  BookOpen,
  Clapperboard,
  Gift,
  Disc3,
  Film,
  Layers,
  LayoutGrid,
  LoaderCircle,
  Plus,
  SlidersHorizontal,
  Tv,
  Package,
  X,
} from "lucide-react";
import { PosterGrid } from "@/components/library/poster-grid.tsx";
import { AppShell } from "@/components/app-shell.tsx";
import {
  GlossChip,
  GlossColumn,
  GlossEyebrow,
  GlossPage,
  GlossSearch,
  GlossStats,
  Segmented,
  Shelf,
  ShelfDivider,
  type ShelfGroup,
} from "@/components/gloss/index.ts";
import {
  MediaCover,
  MediaPage,
  MediaSpine,
  MediaSpineFace,
  type MediaKind,
} from "@/components/gloss/media.tsx";
import { SpineCarousel } from "@/components/gloss/spine-carousel.tsx";
import { ShelfDetail } from "@/components/gloss/shelf-detail.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { AddShelfDialog } from "@/components/library/add-shelf-dialog.tsx";
import { ShelfFolio } from "@/components/library/shelf-folio.tsx";
import { statusMeta, statusToApi } from "@/lib/shelf-status.ts";
import {
  SHELF_PAGE_SIZE,
  useDeleteShelfItem,
  useBookOverviewLookup,
  useSetShelfItemStatus,
  useShelfCounts,
  useShelfDetail,
  useShelfItems,
  useWatchProvidersBatch,
} from "@/hooks/use-shelf-queries.ts";
import { useTilt } from "@/hooks/use-tilt.ts";
import { mediaCoverSize, STATUS_DOT } from "@/lib/gloss/palette.ts";
import { statusLabels, statusText } from "@/lib/shelf-labels.ts";
import { type ShelfCard } from "@/lib/shelves.ts";
import type { ShelvesSearch } from "@/lib/shelves-search.ts";
import { readLocal, usePersistedPref, writeLocal } from "@/lib/local-pref.ts";
import type { CountryWatch } from "@/lib/api/types.ts";
import { useShelfFilters } from "@/hooks/use-shelf-filters.ts";

type MediaTab = "movie" | "tv" | "book" | "wishlist";
const VIEWS = ["posters", "shelf", "covers"] as const;
const ARRANGES = ["status", "title", "year", "added"] as const;
type View = (typeof VIEWS)[number];
type Arrange = (typeof ARRANGES)[number];

/** A shelf holds far more than a grid page; fetch in bigger bites. */
const MEDIA_PAGE = SHELF_PAGE_SIZE * 5;
function guessCountry(): string {
  if (typeof navigator === "undefined") return "US";
  for (const loc of navigator.languages ?? [navigator.language]) {
    const region = loc.split("-")[1];
    if (region && region.length === 2) return region.toUpperCase();
  }
  return "US";
}

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

/** Per-device "where to watch" filter: a country plus one streaming service. */
function useWatchFilter(tab: MediaTab) {
  const [country, setCountryState] = useState(
    () => readLocal("kami-watch-country") ?? guessCountry(),
  );
  const [service, setServiceState] = useState<string | null>(() =>
    readLocal(`kami-${tab}-watch-service`),
  );
  return {
    country,
    service,
    setCountry: (code: string) => {
      setCountryState(code);
      writeLocal("kami-watch-country", code);
    },
    setService: (name: string | null) => {
      setServiceState(name);
      writeLocal(`kami-${tab}-watch-service`, name);
    },
  };
}

const STATUS_ORDER: ShelfCard["status"][] = ["in_progress", "to_try", "done", "abandoned"];

const COPY: Record<
  MediaTab,
  { title: string; eyebrow: string; unit: [string, string]; empty: string }
> = {
  movie: {
    title: "Movies",
    eyebrow: "Video shelf, VHS",
    unit: ["tape", "tapes"],
    empty: "Search TMDB or paste a link to put your first tape on the shelf.",
  },
  tv: {
    title: "Series",
    eyebrow: "Video shelf, DVD box sets",
    unit: ["box set", "box sets"],
    empty: "Search TMDB or paste a link to shelve your first box set.",
  },
  book: {
    title: "Books",
    eyebrow: "Book shelf",
    unit: ["book", "books"],
    empty: "Search Open Library or paste a link to shelve your first book.",
  },
  wishlist: {
    title: "Wishlist",
    eyebrow: "Wish shelf",
    unit: ["wish", "wishes"],
    empty: "Paste a product link to wrap your first wish.",
  },
};

const KIND: Record<MediaTab, MediaKind> = {
  movie: "vhs",
  tv: "dvd",
  book: "book",
  wishlist: "gift",
};
const ACTIVE = { movie: "movies", tv: "series", book: "books", wishlist: "wishlist" } as const;

/**
 * Movies and Series as a video-rental shelf (Gloss): VHS tapes for films,
 * DVD keepcases for shows. Pull one out, it turns to its sleeve and opens to
 * show the tape or disc; "Open" dissolves into the detail page.
 */
export function MediaShelfView({ tab, search }: { tab: MediaTab; search: ShelvesSearch }) {
  const navigate = useNavigate();
  const { query, setQuery, deferredQuery, status, setStatus, limit, loadMore, urlSearch } =
    useShelfFilters(tab, search, MEDIA_PAGE);
  const kind: MediaKind = KIND[tab];
  const copy = COPY[tab];
  const isBook = tab === "book";
  const labels = statusLabels(tab);
  const [view, setView] = usePersistedPref<View>(`kami-${tab}-view-v2`, VIEWS, "posters");
  const [arrange, setArrange] = usePersistedPref<Arrange>(
    `kami-${tab}-arrange`,
    ARRANGES,
    "status",
  );
  const [addOpen, setAddOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ id: string; from: DOMRect } | null>(null);
  const setStatusMutation = useSetShelfItemStatus();
  const deleteMutation = useDeleteShelfItem();
  const tilt = useTilt();
  // Books keep two views, Posters and Shelf; a saved "covers" choice falls back to Posters.
  const shownView: View = isBook && view === "covers" ? "posters" : view;

  const detailQuery = useShelfDetail(tab, detailId);
  const countsQuery = useShelfCounts();
  const itemsQuery = useShelfItems({
    type: tab,
    status: statusToApi(status),
    query: deferredQuery,
    limit,
  });
  const items = useMemo(
    () => (itemsQuery.isPending && !itemsQuery.data ? null : (itemsQuery.data ?? [])),
    [itemsQuery.isPending, itemsQuery.data],
  );
  const hasMore = items != null && items.length >= limit;
  const shelfCount = countsQuery.data?.[tab] ?? null;

  const listSearch = urlSearch;

  const watchable = tab === "movie" || tab === "tv";
  const watch = useWatchFilter(tab);
  const tmdbIds = useMemo(
    () =>
      watchable && items
        ? [...new Set(items.flatMap((it) => (it.tmdbId != null ? [String(it.tmdbId)] : [])))].sort()
        : [],
    [watchable, items],
  );
  const providersQuery = useWatchProvidersBatch(
    tab === "tv" ? "tv" : "movie",
    tmdbIds,
    watchable && (optionsOpen || watch.service != null),
  );
  const providers = providersQuery.data;
  const countries = useMemo(() => {
    const codes = new Set<string>([watch.country]);
    for (const list of Object.values(providers ?? {})) for (const c of list) codes.add(c.code);
    return [...codes]
      .map((code) => ({ code, name: regionNames?.of(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [providers, watch.country]);
  const services = useMemo(() => {
    const tally = new Map<string, number>();
    for (const list of Object.values(providers ?? {})) {
      const c = list.find((x) => x.code === watch.country);
      for (const p of c?.streaming ?? []) tally.set(p.name, (tally.get(p.name) ?? 0) + 1);
    }
    if (watch.service && !tally.has(watch.service)) tally.set(watch.service, 0);
    return [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [providers, watch.country, watch.service]);
  const serviceFilter = watchable ? watch.service : null;
  const watchPending = serviceFilter != null && !providers;

  const sorted = useMemo(() => {
    if (!items) return [];
    let list = [...items];
    if (serviceFilter && providers) {
      list = list.filter((it) => {
        const here: CountryWatch | undefined =
          it.tmdbId == null
            ? undefined
            : providers[String(it.tmdbId)]?.find((c) => c.code === watch.country);
        return here?.streaming.some((p) => p.name === serviceFilter) ?? false;
      });
    }
    if (arrange === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    else if (arrange === "year") list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    else if (arrange === "added") list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [items, arrange, serviceFilter, providers, watch.country]);

  const groups: ShelfGroup<ShelfCard>[] = useMemo(() => {
    if (arrange !== "status" || status !== "all") return [{ id: "all", items: sorted }];
    return STATUS_ORDER.map((s) => ({
      id: s,
      items: sorted.filter((it) => it.status === s),
      label: (
        <ShelfDivider
          label={statusText(labels, s)}
          count={sorted.filter((it) => it.status === s).length}
          color={STATUS_DOT[s]}
          height={170}
        />
      ),
    })).filter((g) => g.items.length > 0);
  }, [sorted, arrange, status, labels]);

  /** Wishlist items open the product page (or a dialog); everything else opens its own page. */
  function openItem(card: ShelfCard) {
    if (tab === "wishlist") {
      if (card.link) window.open(card.link, "_blank", "noopener,noreferrer");
      else setDetailId(card.id);
      return;
    }
    void navigate({
      to:
        tab === "movie"
          ? "/shelves/movies/$id"
          : tab === "tv"
            ? "/shelves/series/$id"
            : "/shelves/books/$id",
      params: { id: card.id },
      search: listSearch,
    });
  }

  const statusChips = statusMeta(tab);
  const animateKey = `${status}|${arrange}|${deferredQuery}|${serviceFilter ?? ""}`;
  const coverSize = mediaCoverSize(kind);
  const pickedItem = picked ? (items?.find((it) => it.id === picked.id) ?? null) : null;
  // A book opened from the shelf without a synopsis gets one from Open Library.
  useBookOverviewLookup(picked?.id ?? "", isBook && pickedItem != null && !pickedItem.overview);
  const unitOne = copy.unit[0];

  return (
    <AppShell active={ACTIVE[tab]} onOpenItem={() => undefined}>
      <GlossPage>
        <GlossColumn className="pt-10 pb-6 sm:pt-14">
          <GlossEyebrow
            icon={
              kind === "vhs" ? (
                <Film className="size-4" aria-hidden="true" />
              ) : kind === "dvd" ? (
                <Disc3 className="size-4" aria-hidden="true" />
              ) : kind === "gift" ? (
                <Gift className="size-4" aria-hidden="true" />
              ) : (
                <BookOpen className="size-4" aria-hidden="true" />
              )
            }
          >
            {copy.eyebrow}
          </GlossEyebrow>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h1 className="g-h1 text-ink">{copy.title}</h1>
            <div className="mb-2 flex items-center gap-2">
              <button type="button" className="g-btn g-btn--ink" onClick={() => setAddOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Add to shelf
              </button>
            </div>
          </div>
          <div className="mt-4">
            <GlossStats
              parts={[
                { value: shelfCount ?? "…", label: shelfCount === 1 ? copy.unit[0] : copy.unit[1] },
                ...(items
                  ? [
                      {
                        value: items.filter((i) => i.status === "done").length,
                        label: labels.done.toLowerCase(),
                      },
                      {
                        value: items.filter((i) => i.status === "in_progress").length,
                        label: labels.inProgress.toLowerCase(),
                      },
                      {
                        value: items.filter((i) => i.status === "to_try").length,
                        label: labels.toTry.toLowerCase(),
                      },
                    ]
                  : []),
              ]}
            />
            {status !== "all" && items ? (
              <p className="mt-1 font-sans text-xs text-ink-muted">
                Counts are for the {copy.unit[1]} on screen.
              </p>
            ) : null}
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Segmented<View>
              label="Shelf view"
              value={shownView}
              onChange={setView}
              options={[
                {
                  id: "posters",
                  label: tab === "wishlist" ? "Cards" : "Posters",
                  icon: <LayoutGrid className="size-4" aria-hidden="true" />,
                },
                {
                  id: "shelf",
                  label: "Shelf",
                  icon: <Layers className="size-4" aria-hidden="true" />,
                },
                ...(isBook
                  ? []
                  : [
                      {
                        id: "covers" as const,
                        label:
                          kind === "vhs"
                            ? "Sleeves"
                            : kind === "dvd"
                              ? "Cases"
                              : kind === "gift"
                                ? "Boxes"
                                : "Covers",
                        icon: <Package className="size-4" aria-hidden="true" />,
                      },
                    ]),
              ]}
            />
            <GlossSearch
              id="media-search"
              value={query}
              onChange={setQuery}
              placeholder={`Search ${copy.title.toLowerCase()}`}
              className="w-full sm:w-72"
            />
            <button
              type="button"
              className="g-btn g-btn--ghost ml-auto h-10 px-4"
              aria-pressed={optionsOpen}
              aria-expanded={optionsOpen}
              aria-controls="shelf-options"
              onClick={() => setOptionsOpen((v) => !v)}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Options
            </button>
          </div>

          {optionsOpen ? (
            <div id="shelf-options" className="kami-sheet g-rise mt-4 grid gap-2 p-5 sm:p-6">
              <span className="font-sans text-sm text-ink-muted">Arrange by</span>
              <Segmented<Arrange>
                size="sm"
                label="Arrange by"
                value={arrange}
                onChange={setArrange}
                options={[
                  { id: "status", label: "Status" },
                  { id: "title", label: "Title" },
                  { id: "year", label: "Year" },
                  { id: "added", label: "Added" },
                ]}
              />
              {watchable ? (
                <div className="mt-3 grid gap-2">
                  <span className="font-sans text-sm text-ink-muted">Streaming on</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Country"
                      className="g-btn g-btn--ghost h-9 px-3 text-sm"
                      value={watch.country}
                      onChange={(e) => watch.setCountry(e.target.value)}
                    >
                      {countries.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Streaming service"
                      className="g-btn g-btn--ghost h-9 px-3 text-sm"
                      value={watch.service ?? ""}
                      onChange={(e) => watch.setService(e.target.value || null)}
                    >
                      <option value="">Any service</option>
                      {services.map(([name, n]) => (
                        <option key={name} value={name}>
                          {name} ({n})
                        </option>
                      ))}
                    </select>
                    {providersQuery.isFetching ? (
                      <LoaderCircle
                        className="size-4 animate-spin text-ink-muted"
                        aria-label="Checking where to watch"
                      />
                    ) : null}
                  </div>
                  <p className="font-sans text-xs text-ink-faint">
                    Checks the {tmdbIds.length} {tmdbIds.length === 1 ? copy.unit[0] : copy.unit[1]}{" "}
                    loaded with a TMDB match. Data from JustWatch via TMDB.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2" aria-label="Filter by status">
            {statusChips.map((s) => (
              <GlossChip
                key={s.id}
                active={status === s.id}
                onClick={() => setStatus(s.id)}
                icon={
                  s.id === "all" ? (
                    kind === "vhs" ? (
                      <Clapperboard className="size-3" aria-hidden="true" />
                    ) : kind === "dvd" ? (
                      <Tv className="size-3" aria-hidden="true" />
                    ) : kind === "gift" ? (
                      <Gift className="size-3" aria-hidden="true" />
                    ) : (
                      <BookOpen className="size-3" aria-hidden="true" />
                    )
                  ) : (
                    <span
                      className="size-2 rounded-full"
                      style={{ background: STATUS_DOT[s.id] }}
                    />
                  )
                }
              >
                {s.label}
              </GlossChip>
            ))}
            {serviceFilter ? (
              <GlossChip
                active
                onClick={() => watch.setService(null)}
                icon={<X className="size-3" aria-hidden="true" />}
              >
                On {serviceFilter}, {regionNames?.of(watch.country) ?? watch.country}
              </GlossChip>
            ) : null}
          </div>
        </GlossColumn>

        <GlossColumn className="pt-6 pb-16">
          {items == null || watchPending ? (
            <ShelfSkeleton kind={kind} />
          ) : serviceFilter && items.length > 0 && sorted.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <p className="font-display text-[28px] tracking-tight text-ink">
                Nothing here is on {serviceFilter}
              </p>
              <p className="mt-2 max-w-sm font-sans text-sm text-ink-muted">
                None of these {copy.unit[1]} stream on {serviceFilter} in{" "}
                {regionNames?.of(watch.country) ?? watch.country} right now.
              </p>
              <button
                type="button"
                className="g-btn g-btn--ghost mt-5"
                onClick={() => watch.setService(null)}
              >
                Any service
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <p className="font-display text-[28px] tracking-tight text-ink">
                {query
                  ? `Nothing matches “${query}”`
                  : (shelfCount ?? 0) > 0
                    ? "Nothing under this label"
                    : "An empty shelf"}
              </p>
              <p className="mt-2 max-w-sm font-sans text-sm text-ink-muted">
                {query || (shelfCount ?? 0) > 0
                  ? "Try another filter, or search the whole shelf."
                  : copy.empty}
              </p>
              {query || (shelfCount ?? 0) > 0 ? (
                <button
                  type="button"
                  className="g-btn g-btn--ghost mt-5"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                  }}
                >
                  Show everything
                </button>
              ) : (
                <button
                  type="button"
                  className="g-btn g-btn--ink mt-5"
                  onClick={() => setAddOpen(true)}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Add your first {unitOne}
                </button>
              )}
            </div>
          ) : shownView === "posters" ? (
            <PosterGrid items={sorted} tab={tab} filtered={status !== "all"} onOpen={openItem} />
          ) : shownView === "shelf" && isBook ? (
            <>
              <SpineCarousel<ShelfCard>
                key={animateKey}
                items={groups.flatMap((g) => g.items)}
                getId={(it) => it.id}
                ariaLabel={`${copy.title} shelf`}
                renderSpine={(it) => <MediaSpineFace kind={kind} item={it} />}
                renderCover={(it) => <MediaCover kind={kind} item={it} />}
                caption={(it) => [it.title, it.subtitle].filter(Boolean).join(" · ")}
                onOpen={(it, from) => setPicked({ id: it.id, from })}
              />
              <p className="mt-4 text-center font-sans text-[13px] text-ink-muted">
                Swipe or use the arrow keys to walk the shelf, click the middle book to open it.
              </p>
            </>
          ) : shownView === "shelf" ? (
            <>
              <Shelf<ShelfCard>
                ariaLabel={`${copy.title} shelf`}
                variant={kind === "vhs" || kind === "dvd" ? "media" : "book"}
                groups={groups}
                getId={(it) => it.id}
                animateKey={animateKey}
                renderSpine={(it) => <MediaSpine kind={kind} item={it} />}
                tooltip={(it) => {
                  const sub = [
                    it.year,
                    statusText(labels, it.status),
                    tab === "tv" && it.totalEpisodes
                      ? `${it.episodesWatched ?? 0}/${it.totalEpisodes} eps`
                      : null,
                    tab === "book" && it.progressPercent && it.status !== "done"
                      ? `${it.progressPercent}% read`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", ");
                  return { title: it.title, sub, label: `${it.title}, ${sub}` };
                }}
                onPick={openItem}
              />
              <p className="mt-6 font-sans text-[13px] text-ink-muted">
                Click a{" "}
                {kind === "vhs"
                  ? "tape"
                  : kind === "dvd"
                    ? "case"
                    : kind === "gift"
                      ? "box"
                      : "book"}{" "}
                to open it. Arrow keys walk the shelf.
              </p>
            </>
          ) : (
            <div
              key={animateKey}
              className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5"
            >
              {sorted.map((it, i) => (
                <div
                  key={it.id}
                  className="g-topic-card !bg-transparent !shadow-none"
                  style={{ "--i": Math.min(i, 16) } as CSSProperties}
                >
                  <button
                    type="button"
                    className="g-tilt"
                    style={{ aspectRatio: `${coverSize.w} / ${coverSize.h}` }}
                    data-gloss-id={it.id}
                    aria-label={`${it.title}${it.year ? `, ${it.year}` : ""}, ${statusText(labels, it.status)}`}
                    onClick={() => openItem(it)}
                    {...tilt}
                  >
                    <MediaCover kind={kind} item={it} />
                  </button>
                  <p className="mt-2.5 line-clamp-1 font-display text-[15px] text-ink">
                    {it.title}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 font-sans text-[12px] text-ink-muted">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: STATUS_DOT[it.status] }}
                      aria-hidden="true"
                    />
                    {statusText(labels, it.status)}
                    {it.year ? `, ${it.year}` : ""}
                    {tab === "tv" && it.totalEpisodes
                      ? `, ${it.episodesWatched ?? 0}/${it.totalEpisodes}`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
          {hasMore ? (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                className="g-btn g-btn--ghost disabled:opacity-60"
                disabled={itemsQuery.isFetching}
                onClick={loadMore}
              >
                {itemsQuery.isFetching ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Show more
              </button>
            </div>
          ) : null}
        </GlossColumn>

        {picked && pickedItem ? (
          <ShelfDetail
            key={picked.id}
            from={picked.from}
            label={pickedItem.title}
            cover={<MediaCover kind={kind} item={pickedItem} />}
            page={(api) => (
              <MediaPage
                api={api}
                item={pickedItem}
                kind={kind}
                loading={false}
                busy={setStatusMutation.isPending || deleteMutation.isPending}
                onOpenDetails={() => api.dissolve(() => openItem(pickedItem))}
                onToggleDone={() =>
                  setStatusMutation.mutate({
                    type: tab,
                    id: pickedItem.id,
                    status: pickedItem.status === "done" ? "to_try" : "done",
                  })
                }
                onRemove={() =>
                  deleteMutation.mutate(
                    { type: tab, id: pickedItem.id },
                    { onSuccess: () => api.close() },
                  )
                }
              />
            )}
            onClosed={() => setPicked(null)}
          />
        ) : null}

        <Dialog open={detailId != null} onOpenChange={(open) => !open && setDetailId(null)}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto overscroll-contain sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display text-balance">
                {detailQuery.data?.item.title ?? "Loading…"}
              </DialogTitle>
            </DialogHeader>
            {detailQuery.data ? (
              <ShelfFolio detail={detailQuery.data} onClose={() => setDetailId(null)} />
            ) : (
              <Skeleton className="h-48 w-full" />
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
      </GlossPage>
    </AppShell>
  );
}

function ShelfSkeleton({ kind }: { kind: MediaKind }) {
  return (
    <div
      className="g-shelf g-shelf--media animate-pulse"
      aria-busy="true"
      aria-label="Loading shelf"
    >
      {Array.from({ length: 14 }).map((_, i) => (
        <div key={i} className="g-slot">
          <span
            className="block rounded-md bg-line"
            style={{
              width: kind === "vhs" ? 38 : kind === "dvd" ? 22 : 32,
              height: 196 + ((i * 7) % 12),
            }}
          />
        </div>
      ))}
    </div>
  );
}
