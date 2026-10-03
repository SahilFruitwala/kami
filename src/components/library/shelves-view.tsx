import { useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useRef, useState, type MouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Link2,
  LoaderCircle,
  PenLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { EpisodeTracker } from "@/components/library/episode-tracker.tsx";
import { WatchWhere } from "@/components/library/watch-where.tsx";
import { Hanko, KamiEyebrow, WashiTag } from "@/components/kami.tsx";
import type { SitePane } from "@/components/site-header.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  SHELF_PAGE_SIZE,
  useAddShelfItem,
  useBookSearch,
  useDeleteShelfItem,
  useFindShelfDuplicates,
  useSetShelfItemStatus,
  useSetShowWatched,
  useShelfCounts,
  useShelfDetail,
  useShelfItems,
  useTmdbSearch,
} from "@/hooks/use-shelf-queries.ts";
import { queryKeys } from "@/lib/query-client.ts";
import {
  shelfPath,
  type ShelfCard,
  type ShelfDetail,
  type ShelfTab,
} from "@/lib/shelves-fns.ts";
import { fetchLinkPreview, type LookupResult } from "@/lib/shelves-lookup.ts";
import { cn } from "@/lib/utils.ts";

export type ShelvesSearch = {
  q?: string;
  status?: string;
};

/** UI filter: `all` means no status predicate on the server. */
type StatusFilter = "to_try" | "done" | "all";

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

const STATUS_META: { id: StatusFilter; label: string }[] = [
  { id: "to_try", label: "To try" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

function parseStatusFilter(v: unknown): StatusFilter {
  if (v === "done" || v === "all") return v;
  return "to_try";
}

function statusToApi(status: StatusFilter): "to_try" | "done" | undefined {
  return status === "all" ? undefined : status;
}

export function validateShelvesSearch(search: Record<string, unknown>): ShelvesSearch {
  return {
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    status:
      typeof search.status === "string" && search.status.length > 0 ? search.status : undefined,
  };
}

/** One shelf type per route — movies, series, books, or wishlist. */
export function ShelvesView({
  tab,
  search,
}: {
  tab: ShelfTab;
  search: ShelvesSearch;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(() => search.q ?? "");
  const [status, setStatus] = useState<StatusFilter>(() => parseStatusFilter(search.status));
  const [limit, setLimit] = useState(SHELF_PAGE_SIZE);
  const deferredQuery = useDeferredValue(query);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
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
    setStatus(parseStatusFilter(search.status));
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
          // Default filter is to_try — omit from the URL.
          status: status === "to_try" ? undefined : status,
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
            <Button
              type="button"
              onClick={() => setAddOpen(true)}
              className="shrink-0 bg-hanko text-white hover:bg-shu"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add to shelf
            </Button>
          </div>

          <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1">
            {STATUS_META.map((s) => (
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

const ADD_TYPE_META: { id: ShelfTab; label: string; hint: string }[] = [
  { id: "movie", label: "Movie", hint: "Search TMDB by title" },
  { id: "tv", label: "TV series", hint: "Search TMDB by title" },
  { id: "book", label: "Book", hint: "Search Open Library by title or author" },
  { id: "wishlist", label: "Wishlist", hint: "Paste a product link to auto-fill" },
];

/**
 * Add-to-shelf flow: pick a type → find it (TMDB / Open Library / link preview)
 * → confirm details. Lookup metadata is stored by `addShelfItem`.
 */
export function AddShelfDialog({
  open,
  initialTab,
  lockType = false,
  onClose,
  onAdded,
}: {
  open: boolean;
  initialTab: ShelfTab;
  /** When true, hide the type tabs (used on per-type shelf pages). */
  lockType?: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [type, setType] = useState<ShelfTab>(initialTab);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [manual, setManual] = useState(false);
  const [fetchingLink, setFetchingLink] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [link, setLink] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [metadata, setMetadata] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<{ id: string; title: string; status: string }[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [linkFetchError, setLinkFetchError] = useState<string | null>(null);

  const addItem = useAddShelfItem();
  const findDupes = useFindShelfDuplicates();
  const queryClient = useQueryClient();

  const tmdbKind = type === "tv" ? "tv" : "movie";
  const searchEnabled = open && !manual && type !== "wishlist" && debounced.length >= 2;
  const tmdbQuery = useTmdbSearch(tmdbKind, debounced, searchEnabled && type !== "book");
  const booksQuery = useBookSearch(debounced, searchEnabled && type === "book");
  const lookupQuery = type === "book" ? booksQuery : tmdbQuery;
  const results = searchEnabled ? (lookupQuery.data ?? null) : null;
  const searching = searchEnabled && lookupQuery.isFetching;
  const searchError =
    searchEnabled && lookupQuery.isError
      ? "Lookup failed — try again, or add it manually below."
      : linkFetchError;

  useEffect(() => {
    if (open) {
      setType(initialTab);
      reset();
    }
  }, [open, initialTab]);

  function reset() {
    setQuery("");
    setDebounced("");
    setManual(false);
    setFetchingLink(false);
    setTitle("");
    setNotes("");
    setLink("");
    setImageUrl("");
    setMetadata({});
    setDuplicates([]);
    setSaveError(null);
    setLinkFetchError(null);
  }

  // Debounce the lookup query like shelf's SearchPicker (350ms).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  function pick(r: LookupResult) {
    setTitle(r.title);
    setLink(r.link ?? "");
    setImageUrl(r.imageUrl ?? "");
    setMetadata(r.metadata);
    setDuplicates([]);
  }

  function switchType(t: ShelfTab) {
    setType(t);
    setQuery("");
    setDebounced("");
    setManual(false);
    setTitle("");
    setLink("");
    setImageUrl("");
    setMetadata({});
    setDuplicates([]);
    setSaveError(null);
    setLinkFetchError(null);
  }

  async function fetchByUrl() {
    const raw = query.trim();
    if (!raw || fetchingLink) return;
    setFetchingLink(true);
    setLinkFetchError(null);
    try {
      const r = await queryClient.fetchQuery({
        queryKey: queryKeys.lookup.link(raw),
        queryFn: () => fetchLinkPreview({ data: raw }),
      });
      if (r) pick(r);
      else setLinkFetchError("Couldn't read that page — fill in the details below instead.");
    } catch {
      setLinkFetchError("Couldn't read that page — fill in the details below instead.");
    } finally {
      setFetchingLink(false);
    }
  }

  async function save(status: "to_try" | "done") {
    if (!title.trim() || addItem.isPending || findDupes.isPending) return;
    setSaveError(null);
    // Movies/TV: hard-block duplicates (DB unique on tmdbId / title). Other
    // shelf types still warn once, then allow "Add anyway".
    const blockDuplicates = type === "movie" || type === "tv";
    if (duplicates.length === 0) {
      try {
        const matches = await findDupes.mutateAsync({
          type,
          title,
          tmdbId: metadata.tmdbId,
        });
        if (matches.length > 0) {
          setDuplicates(matches.map((m) => ({ ...m, status: String(m.status) })));
          return;
        }
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Duplicate check failed.");
        return;
      }
    } else if (blockDuplicates) {
      return;
    }
    try {
      const cleaned = Object.fromEntries(Object.entries(metadata).filter(([, v]) => v.trim() !== ""));
      await addItem.mutateAsync({
        type,
        title: title.trim(),
        notes: notes.trim() || undefined,
        link: link.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        metadata: Object.keys(cleaned).length ? cleaned : undefined,
        status,
      });
      onAdded();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save that item.");
    }
  }

  const saving = addItem.isPending;
  const checkingDuplicates = findDupes.isPending;
  const showForm = manual || title !== "";
  const meta = ADD_TYPE_META.find((m) => m.id === type)!;
  const doneLabel = type === "book" ? "Read" : type === "wishlist" ? "Got it" : "Watched";
  const toTryLabel = type === "book" ? "To read" : type === "wishlist" ? "Wanted" : "To watch";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">
            {!showForm ? `Add a ${meta.label.toLowerCase()}` : "Check the details"}
          </DialogTitle>
        </DialogHeader>

        {!lockType ? (
          <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Item type">
            {ADD_TYPE_META.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={type === t.id}
                onClick={() => switchType(t.id)}
                className={cn(
                  "shrink-0 rounded-[0.25rem] px-3 py-1.5 font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                  type === t.id
                    ? "bg-paper-warm font-semibold text-ink"
                    : "font-medium text-ink-muted hover:text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        {!showForm ? (
          <div className="space-y-4">
            {type === "wishlist" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void fetchByUrl();
                }}
              >
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Link2 className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
                    <Input
                      name="wishlist-url"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="https://…"
                      type="url"
                      autoComplete="off"
                      className="pl-9"
                    />
                  </div>
                  <Button type="submit" disabled={!query.trim() || fetchingLink}>
                    {fetchingLink ? <LoaderCircle className="size-4 animate-spin" /> : "Fetch"}
                  </Button>
                </div>
                <p className="mt-2 font-sans text-xs text-ink-muted">{meta.hint}</p>
              </form>
            ) : (
              <div>
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
                  <Input
                    name="shelf-lookup"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={meta.hint}
                    autoComplete="off"
                    className="pl-9"
                  />
                </div>
                {searching ? (
                  <div className="mt-3 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : null}
                {results && results.length > 0 ? (
                  <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
                    {results.map((r, i) => (
                      <li key={`${r.title}-${i}`}>
                        <button
                          type="button"
                          onClick={() => pick(r)}
                          className="flex w-full items-center gap-3 rounded-[0.25rem] p-2 text-left hover:bg-paper-warm"
                        >
                          {r.imageUrl ? (
                            <img
                              src={r.imageUrl}
                              alt=""
                              className="h-14 w-10 shrink-0 rounded-md border border-line object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-paper-warm font-display text-lg text-ink-faint">
                              {r.title.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-medium">{r.title}</p>
                            <p className="truncate text-[13px] text-ink-muted">
                              {[r.metadata.year, r.metadata.genre, r.metadata.author]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {results?.length === 0 && !searching ? (
                  <p className="py-6 text-center font-sans text-sm text-ink-muted">
                    Nothing found — add it manually below.
                  </p>
                ) : null}
                {(type === "movie" || type === "tv") && (
                  <p className="mt-3 text-center font-sans text-[11px] text-ink-muted">
                    This product uses the TMDB API but is not endorsed or certified by TMDB.
                  </p>
                )}
              </div>
            )}

            {searchError ? <p className="font-sans text-sm font-medium text-hanko">{searchError}</p> : null}

            <div className="flex items-center justify-end pt-1">
              <Button type="button" variant="ghost" onClick={() => setManual(true)}>
                <PenLine className="size-4" aria-hidden="true" />
                Add manually
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {(imageUrl ||
              metadata.author ||
              metadata.year ||
              metadata.genre ||
              metadata.overview ||
              metadata.description) && (
              <div className="flex gap-3">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className="h-28 w-20 shrink-0 rounded-lg border border-line object-cover"
                  />
                ) : null}
                <div className="min-w-0 space-y-1">
                  {(metadata.year || metadata.genre || metadata.author) && (
                    <p className="font-sans text-[13px] text-ink-muted">
                      {[metadata.year, metadata.genre, metadata.author].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {(metadata.overview || metadata.description) && (
                    <p className="line-clamp-4 font-serif text-[14px] leading-relaxed text-ink-soft">
                      {metadata.overview || metadata.description}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="shelf-add-title" className="font-sans text-xs font-semibold text-ink">
                Title
              </label>
              <Input
                id="shelf-add-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDuplicates([]);
                }}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="shelf-add-notes" className="font-sans text-xs font-semibold text-ink">
                Notes
              </label>
              <Textarea
                id="shelf-add-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Who recommended it, why it's on the list…"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="shelf-add-link" className="font-sans text-xs font-semibold text-ink">
                Link (optional)
              </label>
              <Input
                id="shelf-add-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                type="url"
                placeholder="https://…"
              />
            </div>
            {manual ? (
              <div className="space-y-1.5">
                <label htmlFor="shelf-add-image" className="font-sans text-xs font-semibold text-ink">
                  Image URL (optional)
                </label>
                <Input
                  id="shelf-add-image"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  type="url"
                  placeholder="https://…"
                />
              </div>
            ) : null}

            {duplicates.length > 0 ? (
              <div className="rounded-[0.25rem] border border-amber-500/40 bg-amber-500/10 px-4 py-3 font-sans text-[14px]">
                <p className="font-medium text-ink">Already on your shelf</p>
                <ul className="mt-1.5 space-y-0.5 text-ink-soft">
                  {duplicates.map((m) => (
                    <li key={m.id}>
                      “{m.title}” · {m.status === "done" ? doneLabel : toTryLabel}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {saveError ? <p className="font-sans text-sm font-medium text-hanko">{saveError}</p> : null}

            <div className="flex items-center justify-between gap-3 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setTitle("");
                  setImageUrl("");
                  setLink("");
                  setMetadata({});
                  setManual(false);
                  setDuplicates([]);
                }}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Button>
              {duplicates.length > 0 && (type === "movie" || type === "tv") ? (
                <Button type="button" onClick={onClose}>
                  Done
                </Button>
              ) : duplicates.length > 0 ? (
                <Button
                  type="button"
                  disabled={saving || checkingDuplicates}
                  onClick={() => void save("to_try")}
                >
                  Add anyway
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving || checkingDuplicates || !title.trim()}
                    onClick={() => void save("to_try")}
                  >
                    {checkingDuplicates || saving ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {toTryLabel}
                  </Button>
                  <Button
                    type="button"
                    disabled={saving || checkingDuplicates || !title.trim()}
                    onClick={() => void save("done")}
                    className="bg-hanko text-white hover:bg-shu"
                  >
                    {doneLabel}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function detailTitle(d: ShelfDetail): string {
  return d.item.title;
}

function statusLabels(type: ShelfTab) {
  if (type === "book")
    return { done: "Read", toTry: "To read", markDone: "Mark read", markTry: "Mark unread" };
  if (type === "wishlist")
    return { done: "Got it", toTry: "Wanted", markDone: "Mark got it", markTry: "Mark wanted" };
  return {
    done: "Watched",
    toTry: "To watch",
    markDone: "Mark watched",
    markTry: "Mark unwatched",
  };
}

function ShelfTile({
  item,
  tab,
  onOpen,
}: {
  item: ShelfCard;
  tab: ShelfTab;
  onOpen: () => void;
}) {
  const setStatus = useSetShelfItemStatus();
  const setShowWatched = useSetShowWatched();
  const labels = statusLabels(tab);
  const isDone = item.status === "done";
  const busy = setStatus.isPending || setShowWatched.isPending;

  async function toggleDone(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      if (isDone) {
        if (tab === "tv") {
          await setShowWatched.mutateAsync({ itemId: item.id, watched: false });
        } else {
          await setStatus.mutateAsync({ type: tab, id: item.id, status: "to_try" });
        }
        toast.success(`Moved “${item.title}” back to ${labels.toTry.toLowerCase()}`);
      } else {
        if (tab === "tv") {
          await setShowWatched.mutateAsync({ itemId: item.id, watched: true });
        } else {
          await setStatus.mutateAsync({ type: tab, id: item.id, status: "done" });
        }
        toast.success(`Marked “${item.title}” ${labels.done.toLowerCase()}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update status.");
    }
  }

  return (
    <article className="kami-sheet group flex flex-col overflow-hidden transition-transform hover:-translate-y-0.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40 focus-visible:ring-inset"
      >
        <div className="poster-frame relative aspect-[2/3] w-full overflow-hidden bg-paper-warm">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt=""
              width={300}
              height={450}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center font-display text-4xl text-ink-faint">
              {item.title.charAt(0)}
            </div>
          )}
          {isDone ? (
            <span className="absolute top-2 right-2 z-[2]">
              <Hanko glyph="✓" title={labels.done} />
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col p-3 pb-2">
          <p className="line-clamp-2 font-display text-[15px] leading-snug font-medium text-ink">
            {item.title}
          </p>
          {item.subtitle ? (
            <p className="mt-1 line-clamp-1 font-sans text-xs text-ink-muted">{item.subtitle}</p>
          ) : null}
          {tab === "tv" && (item.totalEpisodes || item.episodesWatched) ? (
            <div className="mt-2 space-y-1">
              <p className="font-sans text-[11px] tabular-nums text-ink-muted">
                {item.episodesWatched ?? 0}
                {item.totalEpisodes ? ` / ${item.totalEpisodes}` : ""} eps
                {item.lastEpisode ? ` · Last ${item.lastEpisode}` : ""}
              </p>
              {item.totalEpisodes && item.totalEpisodes > 0 ? (
                <span
                  className="block h-1 w-full overflow-hidden rounded-full bg-paper-warm"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-hanko"
                    style={{
                      width: `${Math.min(
                        ((item.episodesWatched ?? 0) / item.totalEpisodes) * 100,
                        100,
                      )}%`,
                    }}
                  />
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </button>
      <div className="px-3 pb-3">
        <button
          type="button"
          disabled={busy}
          onClick={(e) => void toggleDone(e)}
          aria-pressed={isDone}
          className={cn(
            "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[0.25rem] font-sans text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40 disabled:opacity-60",
            isDone
              ? "border border-line bg-surface text-ink-soft hover:bg-paper-warm hover:text-ink"
              : "bg-hanko text-white shadow-sm hover:bg-shu",
          )}
        >
          {busy ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          ) : isDone ? (
            <Check className="size-3.5 text-hanko" aria-hidden="true" />
          ) : (
            <Check className="size-3.5" aria-hidden="true" />
          )}
          {isDone ? labels.done : labels.markDone}
        </button>
      </div>
    </article>
  );
}

function ShelfFolio({
  detail,
  onClose,
}: {
  detail: ShelfDetail;
  onClose: () => void;
}) {
  const setStatus = useSetShelfItemStatus();
  const deleteItem = useDeleteShelfItem();
  const setShowWatched = useSetShowWatched();
  const genres = detail.type === "wishlist" ? [] : detail.genres;
  const overview =
    detail.type === "movie" || detail.type === "tv" || detail.type === "book"
      ? detail.item.overview
      : detail.item.description;
  const labels = statusLabels(detail.type);
  const busy = setStatus.isPending || deleteItem.isPending || setShowWatched.isPending;
  const isDone = detail.item.status === "done";

  async function markDone() {
    try {
      if (detail.type === "tv") {
        await setShowWatched.mutateAsync({ itemId: detail.item.id, watched: true });
      } else {
        await setStatus.mutateAsync({ type: detail.type, id: detail.item.id, status: "done" });
      }
      toast.success(`Marked “${detail.item.title}” ${labels.done.toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update status.");
    }
  }

  async function markToTry() {
    try {
      if (detail.type === "tv") {
        await setShowWatched.mutateAsync({ itemId: detail.item.id, watched: false });
      } else {
        await setStatus.mutateAsync({ type: detail.type, id: detail.item.id, status: "to_try" });
      }
      toast.success(`Moved “${detail.item.title}” back to ${labels.toTry.toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update status.");
    }
  }

  async function remove() {
    if (!window.confirm(`Remove “${detail.item.title}” from your shelf?`)) return;
    try {
      await deleteItem.mutateAsync({ type: detail.type, id: detail.item.id });
      toast.success(`Removed “${detail.item.title}”`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete that item.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="poster-frame relative w-24 shrink-0 overflow-hidden rounded-[0.25rem] bg-paper-warm">
          {detail.item.imageUrl ? (
            <img
              src={detail.item.imageUrl}
              alt=""
              width={96}
              height={144}
              className="aspect-[2/3] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center font-display text-3xl text-ink-faint">
              {detail.item.title.charAt(0)}
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <WashiTag tone={isDone ? "vermilion" : "paper"}>
              {detail.item.status === "done" ? labels.done : labels.toTry}
            </WashiTag>
            {genres.map((g) => (
              <WashiTag key={g} tone="bamboo">
                {g}
              </WashiTag>
            ))}
          </div>
          {(detail.type === "movie" || detail.type === "tv") && detail.item.tmdbId != null ? (
            <WatchWhere tmdbId={String(detail.item.tmdbId)} kind={detail.type} />
          ) : null}
          <dl className="space-y-1 font-sans text-xs text-ink-muted">
            {detail.type === "movie" && detail.item.releaseYear ? (
              <div className="flex gap-2">
                <dt>Year</dt>
                <dd className="text-ink">{detail.item.releaseYear}</dd>
              </div>
            ) : null}
            {detail.type === "tv" ? (
              <>
                {detail.item.releaseYear ? (
                  <div className="flex gap-2">
                    <dt>Year</dt>
                    <dd className="text-ink">{detail.item.releaseYear}</dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt>Progress</dt>
                  <dd className="text-ink tabular-nums">
                    {detail.item.episodesWatched ?? 0}
                    {detail.item.totalEpisodes
                      ? ` / ${detail.item.totalEpisodes}`
                      : ` ticked (${detail.episodesTicked})`}
                    {detail.item.lastEpisode ? ` · ${detail.item.lastEpisode}` : ""}
                  </dd>
                </div>
              </>
            ) : null}
            {detail.type === "book" ? (
              <>
                {detail.item.author ? (
                  <div className="flex gap-2">
                    <dt>Author</dt>
                    <dd className="text-ink">{detail.item.author}</dd>
                  </div>
                ) : null}
                {detail.item.publishYear ? (
                  <div className="flex gap-2">
                    <dt>Published</dt>
                    <dd className="text-ink">{detail.item.publishYear}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
            {detail.type === "wishlist" ? (
              <>
                {detail.item.price ? (
                  <div className="flex gap-2">
                    <dt>Price</dt>
                    <dd className="text-ink">{detail.item.price}</dd>
                  </div>
                ) : null}
                {detail.item.source ? (
                  <div className="flex gap-2">
                    <dt>Source</dt>
                    <dd className="text-ink">{detail.item.source}</dd>
                  </div>
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

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {isDone ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void markToTry()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {labels.markTry}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void markDone()}
            className="bg-hanko text-white hover:bg-shu"
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            {labels.markDone}
          </Button>
        )}
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

      {overview ? (
        <p className="font-serif text-[15px] leading-relaxed text-ink-soft text-pretty">{overview}</p>
      ) : null}
      {detail.item.notes ? (
        <div className="rounded-[0.25rem] bg-paper-warm p-3">
          <p className="kami-label text-ink-muted">Marginalia</p>
          <p className="mt-1 font-serif text-sm text-ink italic">{detail.item.notes}</p>
        </div>
      ) : null}

      {detail.type === "tv" ? (
        <div className="border-t border-line pt-3">
          <EpisodeTracker itemId={detail.item.id} />
        </div>
      ) : null}
    </div>
  );
}
