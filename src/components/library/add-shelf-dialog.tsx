import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Link2, LoaderCircle, PenLine, Search } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  useAddShelfItem,
  useBookSearch,
  useFindShelfDuplicates,
  useTmdbSearch,
} from "@/hooks/use-shelf-queries.ts";
import { queryKeys } from "@/lib/query-client.ts";
import { type ShelfTab } from "@/lib/shelves-fns.ts";
import { fetchLinkPreview, type LookupResult } from "@/lib/shelves-lookup.ts";
import { cn } from "@/lib/utils.ts";

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
      const cleaned = Object.fromEntries(
        Object.entries(metadata).filter(([, v]) => v.trim() !== ""),
      );
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
          <div
            className="flex items-center gap-1 overflow-x-auto"
            role="tablist"
            aria-label="Item type"
          >
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

            {searchError ? (
              <p className="font-sans text-sm font-medium text-hanko">{searchError}</p>
            ) : null}

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
                <label
                  htmlFor="shelf-add-image"
                  className="font-sans text-xs font-semibold text-ink"
                >
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
            {saveError ? (
              <p className="font-sans text-sm font-medium text-hanko">{saveError}</p>
            ) : null}

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
