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
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell.tsx";
import {
  GlossChip,
  GlossColumn,
  GlossEyebrow,
  GlossPage,
  GlossSearch,
  GlossStats,
  PullOut,
  Segmented,
  Shelf,
  ShelfDivider,
  type ShelfGroup,
} from "@/components/gloss/index.ts";
import {
  MediaCover,
  MediaInside,
  MediaPage,
  MediaSpine,
  MediaSpineFace,
  type MediaKind,
} from "@/components/gloss/media.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { AddShelfDialog } from "@/components/library/add-shelf-dialog.tsx";
import { ShelfFolio } from "@/components/library/shelf-folio.tsx";
import { statusMeta, statusToApi } from "@/lib/shelf-status.ts";
import {
  SHELF_PAGE_SIZE,
  useDeleteShelfItem,
  useSetShelfItemStatus,
  useSetShowWatched,
  useShelfCounts,
  useShelfDetail,
  useShelfItems,
} from "@/hooks/use-shelf-queries.ts";
import { useTilt } from "@/hooks/use-tilt.ts";
import { mediaCoverSize, mediaDepthRatio, STATUS_DOT } from "@/lib/gloss/palette.ts";
import { statusLabels, statusText } from "@/lib/shelf-labels.ts";
import { type ShelfCard } from "@/lib/shelves.ts";
import type { ShelvesSearch } from "@/lib/shelves-search.ts";
import { toastError } from "@/lib/errors";
import { usePersistedPref } from "@/lib/local-pref.ts";
import { confirmAction } from "@/lib/confirm.ts";
import { useShelfFilters } from "@/hooks/use-shelf-filters.ts";

type MediaTab = "movie" | "tv" | "book" | "wishlist";
const VIEWS = ["shelf", "covers"] as const;
const ARRANGES = ["status", "title", "year", "added"] as const;
type View = (typeof VIEWS)[number];
type Arrange = (typeof ARRANGES)[number];

/** A shelf holds far more than a grid page; fetch in bigger bites. */
const MEDIA_PAGE = SHELF_PAGE_SIZE * 5;
const STATUS_ORDER: ShelfCard["status"][] = ["in_progress", "to_try", "done", "abandoned"];

type Picked = { card: ShelfCard; kind: "spine" | "cover" };

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
  const labels = statusLabels(tab);
  const [view, setView] = usePersistedPref<View>(`kami-${tab}-view`, VIEWS, "shelf");
  const [arrange, setArrange] = usePersistedPref<Arrange>(
    `kami-${tab}-arrange`,
    ARRANGES,
    "status",
  );
  const [picked, setPicked] = useState<Picked | null>(null);
  const [opening, setOpening] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const setItemStatus = useSetShelfItemStatus();
  const setShowWatched = useSetShowWatched();
  const deleteItem = useDeleteShelfItem();
  const tilt = useTilt();

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

  const sorted = useMemo(() => {
    if (!items) return [];
    const list = [...items];
    if (arrange === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    else if (arrange === "year") list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    else if (arrange === "added") list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [items, arrange]);

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

  const pickedCard = picked ? (items?.find((it) => it.id === picked.card.id) ?? picked.card) : null;

  async function toggleDone(card: ShelfCard) {
    const done = card.status === "done";
    const next: ShelfCard["status"] = done ? "to_try" : "done";
    setPicked((p) =>
      p && p.card.id === card.id
        ? { ...p, card: { ...p.card, status: next, completedAt: done ? null : Date.now() } }
        : p,
    );
    try {
      if (tab === "tv") await setShowWatched.mutateAsync({ itemId: card.id, watched: !done });
      else await setItemStatus.mutateAsync({ type: tab, id: card.id, status: next });
      toast.success(
        done
          ? `Moved “${card.title}” back to ${labels.toTry.toLowerCase()}`
          : `Marked “${card.title}” ${labels.done.toLowerCase()}`,
      );
    } catch (err) {
      setPicked((p) => (p && p.card.id === card.id ? { ...p, card } : p));
      toastError(err, "Couldn't update status.");
    }
  }

  async function removeItem(card: ShelfCard, close: () => void) {
    const ok = await confirmAction({
      title: `Remove “${card.title}” from your shelf?`,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    try {
      await deleteItem.mutateAsync({ type: tab, id: card.id });
      toast.success(`Removed “${card.title}”`);
      close();
    } catch (err) {
      toastError(err, "Couldn't delete that item.");
    }
  }

  const resume =
    (tab === "tv" || tab === "book") &&
    (status === "all" || status === "in_progress") &&
    !deferredQuery
      ? (items?.find((it) => it.status === "in_progress") ?? null)
      : null;
  const statusChips = statusMeta(tab);
  const animateKey = `${status}|${arrange}|${deferredQuery}`;
  const coverSize = mediaCoverSize(kind);
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
              value={view}
              onChange={setView}
              options={[
                {
                  id: "shelf",
                  label: "Shelf",
                  icon: <Layers className="size-4" aria-hidden="true" />,
                },
                {
                  id: "covers",
                  label:
                    kind === "vhs"
                      ? "Sleeves"
                      : kind === "dvd"
                        ? "Cases"
                        : kind === "gift"
                          ? "Boxes"
                          : "Covers",
                  icon: <LayoutGrid className="size-4" aria-hidden="true" />,
                },
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
          </div>
        </GlossColumn>

        <GlossColumn className="pt-6 pb-16">
          {resume ? (
            <section
              aria-label="Pick up where you left off"
              className="kami-sheet-raised g-rise mb-10 flex items-center gap-5 p-4 sm:gap-7 sm:p-6"
            >
              <div className="w-20 shrink-0 sm:w-28">
                {" "}
                <button
                  type="button"
                  className="g-tilt w-full"
                  style={{ aspectRatio: `${coverSize.w} / ${coverSize.h}` }}
                  aria-label={`Open ${resume.title}`}
                  onClick={() => setPicked({ card: resume, kind: "cover" })}
                  {...tilt}
                >
                  <MediaCover kind={kind} item={resume} />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-sans text-sm text-ink-muted">Pick up where you left off</p>
                <p className="mt-1 line-clamp-2 font-display text-2xl leading-tight tracking-tight sm:text-[28px]">
                  {resume.title}
                </p>
                <p className="mt-1 font-sans text-sm text-ink-soft">
                  {tab === "tv"
                    ? resume.lastEpisode
                      ? `Last watched ${resume.lastEpisode}`
                      : resume.totalEpisodes
                        ? `${resume.episodesWatched ?? 0} of ${resume.totalEpisodes} episodes`
                        : "In progress"
                    : resume.progressPercent
                      ? `${resume.progressPercent}% read`
                      : "In progress"}
                </p>
                {(() => {
                  const pct =
                    tab === "tv"
                      ? resume.totalEpisodes
                        ? Math.round(((resume.episodesWatched ?? 0) / resume.totalEpisodes) * 100)
                        : 0
                      : (resume.progressPercent ?? 0);
                  return pct > 0 ? (
                    <div
                      className="mt-3 h-1 max-w-xs overflow-hidden rounded-full bg-line"
                      role="img"
                      aria-label={`${pct}% done`}
                    >
                      <div
                        className="landing-grow h-full rounded-full bg-persimmon"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null;
                })()}
                <button
                  type="button"
                  className="g-btn g-btn--ink mt-4 h-10"
                  onClick={() => setPicked({ card: resume, kind: "cover" })}
                >
                  Open
                </button>
              </div>
            </section>
          ) : null}
          {items == null ? (
            <ShelfSkeleton kind={kind} />
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
          ) : view === "shelf" ? (
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
                onPick={(it) => setPicked({ card: it, kind: "spine" })}
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
                to pull it out. Arrow keys walk the shelf.
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
                    onClick={() => setPicked({ card: it, kind: "cover" })}
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

        {picked && pickedCard ? (
          <PullOut
            key={picked.card.id}
            source={{ id: picked.card.id, kind: picked.kind }}
            label={pickedCard.title}
            coverSize={coverSize}
            depthRatio={mediaDepthRatio(
              kind,
              picked.kind === "cover" ? "cover" : "spine",
              pickedCard,
            )}
            spineFace={<MediaSpineFace kind={kind} item={pickedCard} />}
            cover={<MediaCover kind={kind} item={pickedCard} />}
            inside={
              <MediaInside
                kind={kind}
                item={pickedCard}
                spinning={opening}
                number={(items ?? []).filter((r) => r.createdAt <= pickedCard.createdAt).length}
              />
            }
            page={(api) => (
              <MediaPage
                api={api}
                item={pickedCard}
                kind={kind}
                loading={opening}
                busy={setItemStatus.isPending || setShowWatched.isPending || deleteItem.isPending}
                onToggleDone={() => void toggleDone(pickedCard)}
                onRemove={() => void removeItem(pickedCard, api.close)}
                onOpenDetails={() => {
                  // Wishlist items open the original product page when they have one.
                  if (tab === "wishlist" && pickedCard.link) {
                    window.open(pickedCard.link, "_blank", "noopener,noreferrer");
                    return;
                  }
                  // Otherwise they open in a dialog.
                  if (tab === "wishlist") {
                    setOpening(true);
                    window.setTimeout(() => api.dissolve(() => setDetailId(pickedCard.id)), 650);
                    return;
                  }
                  setOpening(true);
                  // Let the reels / disc spin for a beat before we leave.
                  window.setTimeout(
                    () =>
                      api.dissolve(
                        () =>
                          void navigate({
                            to:
                              tab === "movie"
                                ? "/shelves/movies/$id"
                                : tab === "tv"
                                  ? "/shelves/series/$id"
                                  : "/shelves/books/$id",
                            params: { id: pickedCard.id },
                            search: listSearch,
                          }),
                      ),
                    650,
                  );
                }}
              />
            )}
            onClosed={() => {
              setPicked(null);
              setOpening(false);
            }}
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
