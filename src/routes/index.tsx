import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  BookMarked,
  ClipboardPaste,
  Inbox,
  Link2,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { ArticleList } from "@/components/article-list.tsx";
import { LibraryFilters } from "@/components/library-filters.tsx";
import { ReaderView } from "@/components/reader-view.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  apiExtract,
  apiImport,
  apiSaveLink,
  buildBookmarklet,
  decodeImportPayload,
} from "@/lib/api-client.ts";
import {
  normalizeSourceUrl,
  readDraftUrl,
  writeDraftUrl,
} from "@/lib/session-article.ts";
import {
  articleToItem,
  itemToArticle,
  useLibraryStore,
  type LibraryItem,
} from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

export const Route = createFileRoute("/")({ component: Home });

const SAMPLES = [
  { label: "Essay", url: "http://www.paulgraham.com/ds.html" },
  { label: "Blog", url: "https://blog.cloudflare.com/workers-announcement/" },
  {
    label: "X article",
    url: "https://x.com/VibeMarketer_/article/2093330541177352217",
  },
] as const;

function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"inbox" | "archive">("inbox");
  const [folderFilter, setFolderFilter] = useState<"all" | "none" | string>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [bookmarklet, setBookmarklet] = useState("");
  const booted = useRef(false);
  const inFlight = useRef<string | null>(null);

  const library = useLibraryStore((s) => s.library);
  const openId = useLibraryStore((s) => s.openId);
  const readerSize = useLibraryStore((s) => s.readerSize);
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const archiveItem = useLibraryStore((s) => s.archiveItem);
  const removeItem = useLibraryStore((s) => s.removeItem);
  const setOpenId = useLibraryStore((s) => s.setOpenId);
  const setReaderSize = useLibraryStore((s) => s.setReaderSize);

  const openItem = useMemo(
    () => library.find((row) => row.id === openId) ?? null,
    [library, openId],
  );
  const article = openItem?.contentHtml ? itemToArticle(openItem) : null;

  const inbox = useMemo(() => library.filter((row) => !row.archived), [library]);
  const archivedItems = useMemo(() => library.filter((row) => row.archived), [library]);
  const visible = useMemo(() => {
    const base = tab === "archive" ? archivedItems : inbox;
    const q = query.trim().toLowerCase();
    return base.filter((row) => {
      if (favoritesOnly && !row.favorited) return false;
      if (folderFilter === "none" && row.folderId) return false;
      if (folderFilter !== "all" && folderFilter !== "none" && row.folderId !== folderFilter) {
        return false;
      }
      if (
        tagFilter &&
        !(row.tags ?? []).some((tag) => tag.toLowerCase() === tagFilter.toLowerCase())
      ) {
        return false;
      }
      if (!q) return true;
      const hay = [row.title, row.author, row.siteName, row.excerpt, row.note, ...(row.tags ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [tab, archivedItems, inbox, folderFilter, tagFilter, query, favoritesOnly]);

  function acceptResult(result: Awaited<ReturnType<typeof apiExtract>>, thenOpen: boolean) {
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    upsertItem(articleToItem(result.article));
    writeDraftUrl("");
    setUrl("");
    setError("");
    if (!thenOpen) setOpenId(null);
    else toast.success("Saved to your list");
    return true;
  }

  async function save(nextUrl = url, thenOpen = true) {
    const trimmed = normalizeSourceUrl(nextUrl);
    if (!trimmed) {
      setError("Paste a blog or X URL first.");
      return;
    }
    if (inFlight.current === trimmed && busy) return;
    setUrl(trimmed);
    writeDraftUrl(trimmed);
    inFlight.current = trimmed;
    setBusy(true);
    setError("");
    try {
      const result = await apiExtract(trimmed);
      if (inFlight.current !== trimmed) return;
      acceptResult(result, thenOpen);
    } catch {
      if (inFlight.current !== trimmed) return;
      setError("Something went wrong while reading that page. Try again.");
    } finally {
      if (inFlight.current === trimmed) {
        inFlight.current = null;
        setBusy(false);
      }
    }
  }

  async function saveLinkOnly() {
    const trimmed = normalizeSourceUrl(url);
    if (!trimmed) {
      setError("Paste a URL first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await apiSaveLink(trimmed);
      acceptResult(result, true);
    } catch {
      setError("Could not save that link.");
    } finally {
      setBusy(false);
    }
  }

  async function importPasted() {
    if (!pasteTitle.trim() || !pasteBody.trim()) {
      toast.error("Add a title and the article text.");
      return;
    }
    setBusy(true);
    try {
      const looksHtml = /<\/?[a-z][\s\S]*>/i.test(pasteBody);
      const result = await apiImport({
        url: pasteUrl.trim() || undefined,
        title: pasteTitle.trim(),
        contentHtml: looksHtml ? pasteBody : undefined,
        contentText: looksHtml ? undefined : pasteBody,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      upsertItem(articleToItem(result.article));
      setPasteOpen(false);
      setPasteTitle("");
      setPasteBody("");
      setPasteUrl("");
      toast.success("Imported article");
    } catch {
      toast.error("Import failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function openItemOrFetch(item: LibraryItem) {
    if (item.contentHtml) {
      setOpenId(item.id);
      return;
    }
    setOpenId(item.id);
    await save(item.url, true);
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    setBookmarklet(buildBookmarklet(window.location.origin));

    const params = new URLSearchParams(window.location.search);
    const importRaw = params.get("import");
    if (importRaw) {
      const payload = decodeImportPayload(importRaw);
      if (payload) {
        setPasteOpen(true);
        setPasteTitle(payload.title);
        setPasteUrl(payload.url);
        setPasteBody(payload.html);
        toast.message("Captured from bookmarklet — review and import.");
      }
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    const draft = readDraftUrl();
    if (draft && !openId) {
      setUrl(draft);
      void save(draft, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (article && openItem) {
    return (
      <ReaderView
        item={openItem}
        article={article}
        readerSize={readerSize}
        onBack={() => setOpenId(null)}
        onArchive={() => {
          archiveItem(openItem.id, !openItem.archived);
          if (!openItem.archived) {
            setOpenId(null);
            toast.success("Archived");
          } else {
            toast.success("Moved to inbox");
          }
        }}
        onToggleSize={() => setReaderSize(readerSize === "lg" ? "md" : "lg")}
      />
    );
  }

  return (
    <main className="relative min-h-dvh overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-paper-warm)_70%,transparent),transparent)]"
      />
      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-md bg-ink text-paper">
            <BookMarked className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-tight">Quarto</p>
            <p className="hidden text-xs text-muted sm:block">Save & read later</p>
          </div>
        </div>
        <Button type="button" variant="ghost" className="h-11 gap-2" onClick={() => setToolsOpen(true)}>
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">Capture tools</span>
        </Button>
      </header>

      <div className="relative mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
        <section className="stagger-in pt-4">
          <p className="text-sm text-muted">Save blogs and X articles. Read them later.</p>
          <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
            Your quiet reading list.
          </h1>
          <p className="mt-3 max-w-lg text-base leading-normal text-ink-soft">
            Paste a link for automatic capture. When a site blocks scraping, paste the article or
            use the bookmarklet — your browser already has the page.
          </p>

          <div className="mt-8">
            <label htmlFor="source-url" className="sr-only">
              Article URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <Input
                id="source-url"
                type="text"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste a blog or X URL"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError("");
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  if (!pasted) return;
                  e.preventDefault();
                  const next = normalizeSourceUrl(pasted);
                  setUrl(next);
                  writeDraftUrl(next);
                  setError("");
                  void save(next, true);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  void save();
                }}
                className="sm:flex-1"
              />
              <Button type="button" className="sm:w-32" disabled={busy} onClick={() => void save()}>
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <>
                    Save
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
            {error ? (
              <div className="mt-2 space-y-2" role="alert">
                <p className="text-sm text-danger">{error}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => void saveLinkOnly()}
                  >
                    <Link2 className="size-3.5" />
                    Save link anyway
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setPasteUrl(url);
                      setPasteOpen(true);
                    }}
                  >
                    <ClipboardPaste className="size-3.5" />
                    Paste article
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Public pages only. Library stays on this device. Capture API is Hono-ready for
                Cloudflare.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Try</span>
            {SAMPLES.map((sample) => (
              <button
                key={sample.url}
                type="button"
                className="h-11 rounded-full bg-paper-warm px-3 text-sm text-ink-soft transition-colors duration-150 hover:bg-line hover:text-ink"
                onClick={() => void save(sample.url, true)}
              >
                {sample.label}
              </button>
            ))}
            <button
              type="button"
              className="h-11 rounded-full border border-line px-3 text-sm text-ink-soft hover:bg-paper-warm hover:text-ink"
              onClick={() => setPasteOpen(true)}
            >
              Paste article
            </button>
          </div>
        </section>

        <div className="mt-10 flex items-center gap-1 border-b border-line">
          <button
            type="button"
            className={cn(
              "flex h-11 items-center gap-2 px-3 text-sm",
              tab === "inbox" ? "border-b-2 border-ink text-ink" : "text-muted",
            )}
            onClick={() => setTab("inbox")}
          >
            <Inbox className="size-4" />
            Inbox
            <span className="tabular-nums text-muted">{inbox.length}</span>
          </button>
          <button
            type="button"
            className={cn(
              "flex h-11 items-center gap-2 px-3 text-sm",
              tab === "archive" ? "border-b-2 border-ink text-ink" : "text-muted",
            )}
            onClick={() => setTab("archive")}
          >
            <Archive className="size-4" />
            Archive
            <span className="tabular-nums text-muted">{archivedItems.length}</span>
          </button>
        </div>

        <LibraryFilters
          folderFilter={folderFilter}
          tagFilter={tagFilter}
          query={query}
          favoritesOnly={favoritesOnly}
          onFolder={setFolderFilter}
          onTag={setTagFilter}
          onQuery={setQuery}
          onFavoritesOnly={setFavoritesOnly}
        />

        {busy && !openId ? <p className="mt-6 text-sm text-muted">Saving a clean copy…</p> : null}

        <ArticleList
          items={visible}
          emptyTitle={tab === "archive" ? "Nothing archived" : "Your inbox is empty"}
          emptyCopy={
            tab === "archive"
              ? "Archive a piece after you finish it. It will wait here."
              : "Paste a URL above to save a blog or X article for later."
          }
          onOpen={(item) => void openItemOrFetch(item)}
          onRemove={removeItem}
        />
      </div>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Paste article</DialogTitle>
            <DialogDescription>
              When automatic capture is blocked, paste the title and body from the page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
            />
            <Input
              placeholder="Source URL (optional)"
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
            />
            <textarea
              className="min-h-48 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
              placeholder="Paste article text or HTML"
              value={pasteBody}
              onChange={(e) => setPasteBody(e.target.value)}
            />
            <Button type="button" className="w-full" disabled={busy} onClick={() => void importPasted()}>
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : "Import to library"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Capture tools</DialogTitle>
            <DialogDescription>
              Bypass bot walls by capturing in your browser, then sending the HTML into Quarto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-ink-soft">
            <p>
              Copy this bookmarklet into a bookmark. On any article page, click it to open Quarto
              with the content ready to import.
            </p>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                void navigator.clipboard.writeText(bookmarklet).then(
                  () => toast.success("Bookmarklet copied — paste it as a new bookmark URL"),
                  () => toast.error("Could not copy"),
                );
              }}
            >
              Copy Quarto bookmarklet
            </Button>
            <p className="text-xs text-muted">
              API routes live under <code className="text-ink">/api/v1/*</code> (Hono). Deploy that
              Worker to Cloudflare with <code className="text-ink">npm run worker:deploy</code>.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
