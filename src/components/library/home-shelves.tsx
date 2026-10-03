import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  Clapperboard,
  Gift,
  Link2,
  LoaderCircle,
  Newspaper,
  Plus,
  Search,
  Tv,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useAddShelfItem, useBookSearch, useTmdbSearch } from "@/hooks/use-shelf-queries.ts";
import { queryKeys } from "@/lib/query-client.ts";
import { shelfPath, type ShelfTab } from "@/lib/shelves-fns.ts";
import { fetchLinkPreview, type LookupResult } from "@/lib/shelves-lookup.ts";
import { cn } from "@/lib/utils.ts";

export type HomeCaptureType = "article" | ShelfTab;

const TABS: { id: HomeCaptureType; label: string; icon: typeof Newspaper }[] = [
  { id: "article", label: "Article", icon: Newspaper },
  { id: "movie", label: "Movie", icon: Clapperboard },
  { id: "tv", label: "Series", icon: Tv },
  { id: "book", label: "Book", icon: BookOpen },
  { id: "wishlist", label: "Wishlist", icon: Gift },
];

const SHELF_LABEL: Record<ShelfTab, string> = {
  movie: "Movies",
  tv: "Series",
  book: "Books",
  wishlist: "Wishlist",
};

/** Type switch — enables one capture box for articles + every shelf. */
export function HomeCaptureTabs({
  value,
  onChange,
}: {
  value: HomeCaptureType;
  onChange: (t: HomeCaptureType) => void;
}) {
  return (
    <div className="flex justify-center">
      <div
        role="tablist"
        aria-label="What to save"
        className="flex max-w-full items-center gap-1 overflow-x-auto pb-1"
      >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[0.25rem] px-3 py-1 font-sans text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
            value === t.id
              ? "bg-hanko font-semibold text-white shadow-sm"
              : "bg-surface font-medium text-ink-soft shadow-[var(--shadow-border)] hover:bg-paper-warm hover:text-ink",
          )}
        >
          <t.icon className="size-3.5" aria-hidden="true" />
          {t.label}
        </button>
      ))}
      </div>
    </div>
  );
}

/**
 * Scoped quick-add: the same home input searches TMDB / Open Library (or
 * fetches a wishlist link) and saves straight to the enabled shelf.
 */
export function ShelfQuickCapture({ type }: { type: ShelfTab }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [fetchingLink, setFetchingLink] = useState(false);

  const addItem = useAddShelfItem();
  const queryClient = useQueryClient();
  const isWishlist = type === "wishlist";
  const isBook = type === "book";

  const tmdbKind = type === "tv" ? "tv" : "movie";
  const searchEnabled = !isWishlist && debounced.length >= 2;
  const tmdbQuery = useTmdbSearch(tmdbKind, debounced, searchEnabled && !isBook);
  const booksQuery = useBookSearch(debounced, searchEnabled && isBook);
  const lookup = isBook ? booksQuery : tmdbQuery;
  const results = searchEnabled ? (lookup.data ?? null) : null;
  const searching = searchEnabled && lookup.isFetching;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Clear the box when the enabled shelf changes.
  useEffect(() => {
    setQuery("");
    setDebounced("");
    setAddingKey(null);
  }, [type]);

  async function saveResult(r: LookupResult, manualTitle?: string) {
    const title = (manualTitle ?? r.title).trim();
    if (!title || addingKey) return;
    const key = `${title}-${r.metadata.tmdbId ?? r.link ?? "manual"}`;
    setAddingKey(key);
    try {
      const cleaned = Object.fromEntries(
        Object.entries(r.metadata).filter(([, v]) => v.trim() !== ""),
      );
      await addItem.mutateAsync({
        type,
        title,
        link: r.link?.trim() || undefined,
        imageUrl: r.imageUrl?.trim() || undefined,
        metadata: Object.keys(cleaned).length ? cleaned : undefined,
        status: "to_try",
      });
      toast.success(`Saved “${title}” to ${SHELF_LABEL[type]}`);
      setQuery("");
      setDebounced("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that item.");
    } finally {
      setAddingKey(null);
    }
  }

  async function saveWishlistLink() {
    const raw = query.trim();
    if (!raw || fetchingLink || addingKey) return;
    setFetchingLink(true);
    try {
      let preview = null;
      try {
        preview = await queryClient.fetchQuery({
          queryKey: queryKeys.lookup.link(raw),
          queryFn: () => fetchLinkPreview({ data: raw }),
        });
      } catch {
        preview = null;
      }
      const title = preview?.title?.trim() || raw;
      const key = `wishlist-${title}`;
      setAddingKey(key);
      try {
        const cleaned = preview
          ? Object.fromEntries(Object.entries(preview.metadata).filter(([, v]) => v.trim() !== ""))
          : {};
        await addItem.mutateAsync({
          type: "wishlist",
          title,
          link: raw,
          imageUrl: preview?.imageUrl?.trim() || undefined,
          metadata: Object.keys(cleaned).length ? cleaned : undefined,
          status: "to_try",
        });
        toast.success(`Saved “${title}” to Wishlist`);
        setQuery("");
        setDebounced("");
      } finally {
        setAddingKey(null);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that link.");
    } finally {
      setFetchingLink(false);
    }
  }

  const busy = fetchingLink || addingKey != null;
  const placeholder = isWishlist
    ? "Paste a product link…"
    : isBook
      ? "Search books by title or author…"
      : `Search ${SHELF_LABEL[type].toLowerCase()} by title…`;

  return (
    <section aria-label={`Save to ${SHELF_LABEL[type]}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isWishlist) void saveWishlistLink();
        }}
      >
        <div className="kami-sheet flex flex-col gap-2 p-2 focus-within:ring-2 focus-within:ring-hanko/40 sm:flex-row sm:items-center sm:px-3">
          <div className="flex min-w-0 w-full items-center gap-2">
            {isWishlist ? (
              <Link2 className="size-[18px] shrink-0 text-ink-muted" aria-hidden="true" />
            ) : (
              <Search className="size-[18px] shrink-0 text-ink-muted" aria-hidden="true" />
            )}
            <label htmlFor="shelf-capture-input" className="sr-only">
              {placeholder}
            </label>
            <Input
              id="shelf-capture-input"
              name="shelf-capture"
              type={isWishlist ? "url" : "search"}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            />
          </div>
          {isWishlist ? (
            <Button
              type="submit"
              disabled={!query.trim() || busy}
              className="h-11 w-full shrink-0 bg-hanko text-white shadow-sm hover:bg-shu active:translate-y-px sm:w-auto"
            >
              {busy ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                <>
                  Add to Wishlist
                  <Plus className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          ) : null}
        </div>
      </form>

      {!isWishlist ? (
        <div className="mt-2">
          {searching ? (
            <p className="px-1 font-sans text-xs text-ink-muted" role="status">
              Searching…
            </p>
          ) : null}
          {results && results.length > 0 ? (
            <ul key={debounced} className="kami-sheet divide-y divide-line overflow-hidden">
              {results.slice(0, 5).map((r, i) => {
                const key = `${r.title}-${i}`;
                const rowBusy = addingKey != null;
                return (
                  <li
                    key={key}
                    style={{ animationDelay: `${Math.min(i * 45, 180)}ms` }}
                    className="shelf-result-in flex items-center gap-3 p-2"
                  >
                    {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        alt=""
                        loading="lazy"
                        className="h-12 w-9 shrink-0 rounded-md border border-line object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-9 shrink-0 items-center justify-center rounded-md border border-line bg-paper-warm font-display text-lg text-ink-faint" aria-hidden="true">
                        {r.title.charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                      <span className="block truncate font-sans text-xs text-ink-muted">
                        {[r.metadata.year, r.metadata.genre, r.metadata.author]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={rowBusy}
                      onClick={() => void saveResult(r)}
                      className="shrink-0 bg-hanko text-white hover:bg-shu"
                    >
                      {addingKey ? (
                        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus className="size-3.5" aria-hidden="true" />
                      )}
                      Add
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {!searching && debounced.length >= 2 && results?.length === 0 ? (
            <div
              key={`empty-${debounced}`}
              className="shelf-result-in kami-sheet flex items-center justify-between gap-3 p-3"
            >
              <p className="truncate font-sans text-sm text-ink-muted">
                No match — add “{debounced}” as-is?
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void saveResult({ title: debounced, metadata: {} }, debounced)
                }
              >
                Add
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between px-1">
        <p className="font-sans text-xs text-ink-muted">
          {isWishlist
            ? "Link preview is fetched automatically."
            : isBook
              ? "Powered by Open Library."
              : "Powered by TMDB."}
        </p>
        <Link
          to={shelfPath(type)}
          className="rounded-sm font-sans text-xs font-semibold text-hanko hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
        >
          Open {SHELF_LABEL[type]} →
        </Link>
      </div>
    </section>
  );
}
