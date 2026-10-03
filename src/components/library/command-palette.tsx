import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clapperboard,
  ClipboardPaste,
  Gift,
  House,
  LibraryBig,
  Link2,
  LoaderCircle,
  Plus,
  Settings,
  Tv,
  Vault,
} from "lucide-react";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command.tsx";
import {
  useAddShelfItem,
  useBookSearch,
  useFindShelfDuplicates,
  useLinkPreview,
  useTmdbSearch,
} from "@/hooks/use-shelf-queries.ts";
import { articleToItem, useLibraryStore, type LibraryItem } from "@/lib/store.ts";
import { extractArticle, saveLinkArticle } from "@/lib/article-fns.ts";
import { persistArticleItem } from "@/lib/library-remote.ts";
import { shelfPath, type ShelfTab } from "@/lib/shelves.ts";
import type { LookupResult } from "@/lib/shelves-lookup.ts";

type AddPage = "home" | ShelfTab;

const ADD_PAGES: { id: ShelfTab; label: string; hint: string; icon: typeof Clapperboard }[] = [
  { id: "movie", label: "Movie", hint: "Search TMDB by title", icon: Clapperboard },
  { id: "tv", label: "TV series", hint: "Search TMDB by title", icon: Tv },
  { id: "book", label: "Book", hint: "Search Open Library", icon: BookOpen },
  { id: "wishlist", label: "Wishlist", hint: "Paste a product link", icon: Gift },
];

function looksLikeUrl(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  if (/^https?:\/\/\S+\.\S+/i.test(v)) return true;
  if (/^www\.\S+\.\S+/i.test(v)) return true;
  // bare domain + path, e.g. example.com/article
  if (/^[^\s@]+\.[a-z]{2,}(\/\S*)?$/i.test(v) && !v.includes(" ")) return true;
  return false;
}

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

/**
 * Global ⌘K palette (mounted in AppShell, so it works on every pane):
 * - paste a link → save article, or add it to the wishlist
 * - jump to a shelf search → live TMDB / Open Library / link-preview results
 *   with one-key add, or a manual fallback
 * - jump between panes, or open a bound work.
 */
export function CommandPalette({
  onOpenItem,
}: {
  onOpenItem: (item: LibraryItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<AddPage>("home");
  const navigate = useNavigate();
  const library = useLibraryStore((s) => s.library);

  const [savingUrl, setSavingUrl] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);
  const addItem = useAddShelfItem();
  const findDupes = useFindShelfDuplicates();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Reset to home when the palette opens; clear the query when it closes
  // (but not while a save/add is still in flight).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setPage("home");
    }
    if (!open && wasOpen.current && !savingUrl && !addingKey) {
      setQuery("");
    }
    wasOpen.current = open;
  }, [open, savingUrl, addingKey]);

  const urlLike = looksLikeUrl(query);
  const trimmedQuery = query.trim();
  const activeAddMeta = ADD_PAGES.find((p) => p.id === page);

  const shelfSearchOpen = open && page !== "home" && page !== "wishlist";
  const tmdbKind = page === "tv" ? "tv" : "movie";
  const tmdbQuery = useTmdbSearch(
    tmdbKind,
    deferredQuery,
    shelfSearchOpen && page !== "book",
  );
  const booksQuery = useBookSearch(deferredQuery, shelfSearchOpen && page === "book");
  const lookupQuery = page === "book" ? booksQuery : tmdbQuery;
  const results = shelfSearchOpen ? (lookupQuery.data ?? null) : null;
  const searching = shelfSearchOpen && deferredQuery.trim().length >= 2 && lookupQuery.isFetching;

  const wishlistUrl =
    open && page === "wishlist" && looksLikeUrl(deferredQuery)
      ? normalizeUrl(deferredQuery.trim())
      : "";
  const linkPreviewQuery = useLinkPreview(wishlistUrl, Boolean(wishlistUrl));
  const linkPreview = linkPreviewQuery.data ?? null;
  const fetchingLink = Boolean(wishlistUrl) && linkPreviewQuery.isFetching;

  function close() {
    setOpen(false);
  }

  function go(
    to:
      | "/app"
      | "/library"
      | "/vault"
      | "/settings"
      | "/shelves/movies"
      | "/shelves/series"
      | "/shelves/books"
      | "/shelves/wishlist",
  ) {
    close();
    void navigate({ to });
  }

  function goShelf(type: ShelfTab) {
    close();
    void navigate({ to: shelfPath(type) });
  }

  function openWork(item: LibraryItem) {
    close();
    onOpenItem(item);
  }

  function enterAdd(next: ShelfTab, seedQuery?: string) {
    // Keep the palette open when drilling into a shelf page — cmdk select
    // must not dismiss the dialog mid-flow (that flash looked like a stray popup).
    setOpen(true);
    setPage(next);
    if (seedQuery != null) setQuery(seedQuery);
  }

  /** Persist + open the canonical server row, so `/read?id=` resolves now and after refresh. */
  async function persistAndOpen(item: LibraryItem, successLabel: string) {
    try {
      const saved = await persistArticleItem(item);
      toast.success(successLabel);
      close();
      void navigate({ to: "/read", search: { id: saved.id } });
    } catch (err) {
      console.error("[command-palette] persist failed:", err);
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        // Offline: keep the optimistic local copy so the reader still opens.
        // The outbox keeps one retry queued.
        toast.success("Saved here — will sync when back online");
        close();
        void navigate({ to: "/read", search: { id: item.id } });
        return;
      }
      // Online failure: stay open and show the real reason — navigating to a
      // row the next refresh can't see is worse than no navigation.
      toast.error(err instanceof Error ? err.message : "Could not save that article.");
    }
  }

  async function saveArticleFromQuery(saveLinkOnly = false) {
    const raw = normalizeUrl(trimmedQuery);
    if (!raw || savingUrl) return;
    setSavingUrl(true);
    try {
      const result = saveLinkOnly
        ? await saveLinkArticle({ data: { url: raw } })
        : await extractArticle({ data: { url: raw } });
      if (!result.ok) {
        // Fall back to a link-only save so the URL is never lost.
        if (!saveLinkOnly) {
          try {
            const fallback = await saveLinkArticle({ data: { url: raw } });
            if (fallback.ok) {
              await persistAndOpen(articleToItem(fallback.article), "Saved link — clean copy unavailable");
              return;
            }
          } catch {
            // fall through to the error toast below
          }
        }
        toast.error(result.error);
        return;
      }
      await persistAndOpen(articleToItem(result.article), "Saved to your list");
    } catch {
      toast.error("Could not save that link. Try again.");
    } finally {
      setSavingUrl(false);
    }
  }

  async function addShelfResult(r: LookupResult, type: ShelfTab) {
    const key = `${type}:${r.title}:${r.link ?? ""}`;
    if (addingKey || addItem.isPending || findDupes.isPending) return;
    setAddingKey(key);
    try {
      const cleaned = Object.fromEntries(
        Object.entries(r.metadata ?? {}).filter(([, v]) => v.trim() !== ""),
      );
      if (type === "movie" || type === "tv") {
        const matches = await findDupes.mutateAsync({
          type,
          title: r.title,
          tmdbId: cleaned.tmdbId,
        });
        if (matches.length > 0) {
          toast.message(`“${r.title}” is already on your shelf`, {
            action: {
              label: "View shelf",
              onClick: () => goShelf(type),
            },
          });
          close();
          return;
        }
      }
      // Drop oversize image URLs before the server Zod max(2000) — common on
      // product/CDN og:image links and was failing the whole wishlist save.
      const imageUrl = r.imageUrl?.trim();
      await addItem.mutateAsync({
        type,
        title: r.title.trim().slice(0, 300),
        link: r.link?.trim() || (page === "wishlist" && urlLike ? normalizeUrl(trimmedQuery) : undefined),
        imageUrl: imageUrl && imageUrl.length <= 2000 ? imageUrl : undefined,
        metadata: Object.keys(cleaned).length ? cleaned : undefined,
        status: "to_try",
      });
      toast.success(`Added “${r.title}”`, {
        action: {
          label: "View shelf",
          onClick: () => goShelf(type),
        },
      });
      close();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Couldn't save that item.";
      if (message === "Already on your shelf") {
        toast.message(`“${r.title}” is already on your shelf`, {
          action: {
            label: "View shelf",
            onClick: () => goShelf(type),
          },
        });
        close();
      } else {
        toast.error(message);
      }
    } finally {
      setAddingKey(null);
    }
  }

  async function addManualTitle(type: ShelfTab) {
    const title = trimmedQuery || linkPreview?.title || "";
    if (!title.trim() || addingKey) return;
    const meta: Record<string, string> = {};
    if (linkPreview?.metadata.description) meta.description = linkPreview.metadata.description;
    if (linkPreview?.metadata.source) meta.source = linkPreview.metadata.source;
    await addShelfResult(
      {
        title: title.trim().slice(0, 300),
        link: urlLike ? normalizeUrl(trimmedQuery) : linkPreview?.link,
        imageUrl: linkPreview?.imageUrl,
        metadata: meta,
      },
      type,
    );
  }

  const works = useMemo(
    () => [...library].sort((a, b) => b.savedAt - a.savedAt).slice(0, 40),
    [library],
  );

  const placeholder =
    page === "home"
      ? "Paste a link to save, or search works & shelves…"
      : page === "wishlist"
        ? "Paste a product link, or type a wishlist title…"
        : `${activeAddMeta?.hint ?? "Search"} — type to search, Enter adds`;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={page === "home" ? "Command palette" : `Add ${activeAddMeta?.label ?? ""}`}
      description={
        page === "home"
          ? "Paste a link to save an article, or search movies, series, books and wishlist."
          : `Search and add ${activeAddMeta?.label ?? "items"} to your shelves.`
      }
      // taller so live results breathe
      className="sm:max-w-xl"
      shouldFilter={page === "home"}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Escape" && page !== "home") {
            e.preventDefault();
            setPage("home");
          }
          // In a shelf page, Enter adds the raw query as a manual item.
          if (e.key === "Enter" && page !== "home" && trimmedQuery.length > 0) {
            // Let cmdk pick a highlighted result first; only manual-add when
            // there are no live results to choose from.
            if (results == null || results.length === 0) {
              e.preventDefault();
              void addManualTitle(page);
            }
          }
        }}
      />
      <CommandList>
        <CommandEmpty>
          {page !== "home" && trimmedQuery.length >= 2 ? (
            <button
              type="button"
              className="mx-auto flex items-center gap-2 rounded-full bg-hanko px-4 py-2 text-sm font-semibold text-white hover:bg-shu"
              onClick={() => void addManualTitle(page)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add “{trimmedQuery.slice(0, 60)}” manually
            </button>
          ) : (
            "No results found."
          )}
        </CommandEmpty>

        {page === "home" ? (
          <>
            <CommandGroup heading="Add">
              {urlLike ? (
                <>
                  <CommandItem
                    value={`save article ${trimmedQuery}`}
                    keywords={["paste", "link", "url", "clip", "save article"]}
                    disabled={savingUrl}
                    onSelect={() => void saveArticleFromQuery(false)}
                  >
                    {savingUrl ? (
                      <LoaderCircle className="animate-spin" aria-hidden="true" />
                    ) : (
                      <ClipboardPaste aria-hidden="true" />
                    )}
                    <span className="truncate">Save article from link</span>
                    <CommandShortcut>↵</CommandShortcut>
                  </CommandItem>
                  <CommandItem
                    value={`wishlist from link ${trimmedQuery}`}
                    keywords={["wishlist", "product", "buy", "link"]}
                    onSelect={() => enterAdd("wishlist")}
                  >
                    <Gift aria-hidden="true" />
                    <span className="truncate">Add link to wishlist…</span>
                    <CommandShortcut>
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </CommandShortcut>
                  </CommandItem>
                </>
              ) : null}
              {ADD_PAGES.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`add ${p.label} ${p.hint}`}
                  keywords={[p.label.toLowerCase(), p.id, "add", "search", p.hint]}
                  onSelect={() => enterAdd(p.id, trimmedQuery.length >= 2 ? trimmedQuery : "")}
                >
                  <p.icon aria-hidden="true" />
                  <span className="truncate">
                    Add {p.label.toLowerCase()}…
                    {trimmedQuery.length >= 2 && !urlLike ? (
                      <span className="text-muted-foreground"> for “{trimmedQuery.slice(0, 40)}”</span>
                    ) : null}
                  </span>
                  <CommandShortcut>
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Go to">
              <CommandItem value="go home" onSelect={() => go("/app")}>
                <House aria-hidden="true" />
                Home
                <CommandShortcut>G H</CommandShortcut>
              </CommandItem>
              <CommandItem value="go library" onSelect={() => go("/library")}>
                <LibraryBig aria-hidden="true" />
                Library
                <CommandShortcut>G L</CommandShortcut>
              </CommandItem>
              <CommandItem value="go movies shelf" onSelect={() => go("/shelves/movies")}>
                <Clapperboard aria-hidden="true" />
                Movies
                <CommandShortcut>G M</CommandShortcut>
              </CommandItem>
              <CommandItem value="go series tv shelf" onSelect={() => go("/shelves/series")}>
                <Tv aria-hidden="true" />
                Series
                <CommandShortcut>G T</CommandShortcut>
              </CommandItem>
              <CommandItem value="go books shelf" onSelect={() => go("/shelves/books")}>
                <BookOpen aria-hidden="true" />
                Books
                <CommandShortcut>G B</CommandShortcut>
              </CommandItem>
              <CommandItem value="go wishlist shelf" onSelect={() => go("/shelves/wishlist")}>
                <Gift aria-hidden="true" />
                Wishlist
                <CommandShortcut>G W</CommandShortcut>
              </CommandItem>
              <CommandItem value="go vault highlights" onSelect={() => go("/vault")}>
                <Vault aria-hidden="true" />
                Vault
                <CommandShortcut>G V</CommandShortcut>
              </CommandItem>
              <CommandItem value="go settings preferences" onSelect={() => go("/settings")}>
                <Settings aria-hidden="true" />
                Settings
                <CommandShortcut>G S</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Works">
              {works.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.title} ${item.author ?? ""} ${item.siteName ?? ""} ${item.url} ${(item.tags ?? []).join(" ")} ${item.note ?? ""} ${(item.highlights ?? []).map((h) => `${h.text} ${h.note}`).join(" ")}`}
                  keywords={[...(item.tags ?? []), item.author ?? "", item.siteName ?? ""]}
                  onSelect={() => openWork(item)}
                >
                  <BookOpen aria-hidden="true" />
                  <span className="truncate">{item.title}</span>
                  {item.highlights?.length ? (
                    <CommandShortcut>{item.highlights.length} inked</CommandShortcut>
                  ) : item.readingMinutes ? (
                    <CommandShortcut>{item.readingMinutes} min</CommandShortcut>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : (
          <>
            <CommandGroup heading={`Add ${activeAddMeta?.label ?? ""}`}>
              <CommandItem
                value="__back"
                keywords={["back", "home", "cancel"]}
                onSelect={() => setPage("home")}
              >
                <ArrowLeft aria-hidden="true" />
                Back to all commands
                <CommandShortcut>esc</CommandShortcut>
              </CommandItem>
              {page === "wishlist" && urlLike ? (
                <CommandItem
                  value={`save wishlist link ${trimmedQuery}`}
                  keywords={["fetch", "link", "wishlist", "product"]}
                  disabled={fetchingLink || addingKey != null}
                  onSelect={() => {
                    if (linkPreview) void addShelfResult(linkPreview, "wishlist");
                    else if (!fetchingLink) void addManualTitle("wishlist");
                  }}
                >
                  {fetchingLink || addingKey ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Link2 aria-hidden="true" />
                  )}
                  <span className="truncate">
                    {fetchingLink
                      ? "Reading link…"
                      : linkPreview
                        ? `Add “${linkPreview.title.slice(0, 50)}” to wishlist`
                        : "Add link to wishlist"}
                  </span>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              ) : null}
              {page === "wishlist" && !urlLike && trimmedQuery.length >= 2 ? (
                <CommandItem
                  value={`manual wishlist ${trimmedQuery}`}
                  keywords={["manual", "wishlist", "add"]}
                  disabled={addingKey != null}
                  onSelect={() => void addManualTitle("wishlist")}
                >
                  {addingKey ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus aria-hidden="true" />
                  )}
                  <span className="truncate">Add “{trimmedQuery.slice(0, 50)}” to wishlist</span>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              ) : null}
              {page !== "wishlist" && trimmedQuery.trim().length >= 2 ? (
                <CommandItem
                  value={`manual ${page} ${trimmedQuery}`}
                  keywords={["manual", "add", page]}
                  disabled={addingKey != null}
                  onSelect={() => void addManualTitle(page)}
                >
                  {addingKey ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus aria-hidden="true" />
                  )}
                  <span className="truncate">
                    Add “{trimmedQuery.slice(0, 50)}” as {activeAddMeta?.label.toLowerCase()}
                  </span>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              ) : null}
            </CommandGroup>

            {page === "wishlist" ? null : (
              <CommandGroup heading={searching ? "Searching…" : results?.length ? "Results — pick to add" : undefined}>
                {searching
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <CommandItem key={`skeleton-${i}`} value={`searching-${i}`} disabled>
                        <LoaderCircle className="animate-spin" aria-hidden="true" />
                        <span className="truncate text-muted-foreground">Searching…</span>
                      </CommandItem>
                    ))
                  : (results ?? []).map((r, i) => {
                      const key = `${page}:${r.title}:${r.link ?? i}`;
                      const busy = addingKey === key;
                      const sub = [r.metadata.year, r.metadata.genre, r.metadata.author]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <CommandItem
                          key={`${r.title}-${i}`}
                          value={`${r.title} ${sub} ${r.link ?? ""}`}
                          keywords={[r.title, r.metadata.author ?? "", r.metadata.year ?? ""]}
                          disabled={addingKey != null}
                          onSelect={() => void addShelfResult(r, page)}
                        >
                          {r.imageUrl ? (
                            <img
                              src={r.imageUrl}
                              alt=""
                              className="h-8 w-6 shrink-0 rounded border border-line object-cover"
                            />
                          ) : busy ? (
                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Plus aria-hidden="true" />
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            {r.title}
                            {sub ? <span className="text-muted-foreground"> · {sub}</span> : null}
                          </span>
                          {busy ? (
                            <CommandShortcut>adding…</CommandShortcut>
                          ) : (
                            <CommandShortcut>add</CommandShortcut>
                          )}
                        </CommandItem>
                      );
                    })}
              </CommandGroup>
            )}
            {page !== "wishlist" ? (
              <p className="px-3 py-2 text-center text-[11px] text-muted-foreground">
                {page === "book"
                  ? "Powered by Open Library."
                  : "This product uses the TMDB API but is not endorsed or certified by TMDB."}
              </p>
            ) : null}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
