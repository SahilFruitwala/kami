import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  BookMarked,
  Inbox,
  LoaderCircle,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { ArticleList } from "@/components/article-list.tsx";
import { LibraryFilters } from "@/components/library-filters.tsx";
import { ReaderView } from "@/components/reader-view.tsx";
import { SetupDialog } from "@/components/setup-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { Article } from "@/lib/article-types.ts";
import { bindEpub, extractArticle } from "@/lib/kindle-fns.ts";
import {
  gmailComposeUrl,
  isKindleEmail,
} from "@/lib/kindle-email.ts";
import {
  normalizeSourceUrl,
  readDraftUrl,
  writeDraftUrl,
} from "@/lib/session-article.ts";
import {
  articleIdFromUrl,
  articleToItem,
  itemToArticle,
  useKindleStore,
  type LibraryItem,
} from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

export const Route = createFileRoute("/")({ component: Home });

const SAMPLES = [
  {
    label: "Wikipedia",
    url: "https://en.wikipedia.org/wiki/Amazon_Kindle",
  },
  {
    label: "Essay",
    url: "http://www.paulgraham.com/ds.html",
  },
  {
    label: "X article",
    url: "https://x.com/VibeMarketer_/article/2093330541177352217",
  },
] as const;

function downloadBase64(filename: string, mime: string, base64: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const file = new File([bytes], filename, { type: mime });
  const href = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
  return file;
}

function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"extract" | "send" | "download" | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"inbox" | "archive">("inbox");
  const [folderFilter, setFolderFilter] = useState<"all" | "none" | string>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);
  const booted = useRef(false);
  const inFlight = useRef<string | null>(null);

  const kindleEmail = useKindleStore((s) => s.kindleEmail);
  const library = useKindleStore((s) => s.library);
  const openId = useKindleStore((s) => s.openId);
  const readerSize = useKindleStore((s) => s.readerSize);
  const upsertItem = useKindleStore((s) => s.upsertItem);
  const archiveItem = useKindleStore((s) => s.archiveItem);
  const markStatus = useKindleStore((s) => s.markStatus);
  const removeItem = useKindleStore((s) => s.removeItem);
  const setOpenId = useKindleStore((s) => s.setOpenId);
  const setReaderSize = useKindleStore((s) => s.setReaderSize);
  const connected = isKindleEmail(kindleEmail);

  const openItem = useMemo(
    () => library.find((row) => row.id === openId) ?? null,
    [library, openId],
  );
  const article = openItem && openItem.contentHtml ? itemToArticle(openItem) : null;

  const inbox = useMemo(() => library.filter((row) => !row.archived), [library]);
  const archived = useMemo(() => library.filter((row) => row.archived), [library]);
  const visible = useMemo(() => {
    const base = tab === "archive" ? archived : inbox;
    return base.filter((row) => {
      if (folderFilter === "none" && row.folderId) return false;
      if (folderFilter !== "all" && folderFilter !== "none" && row.folderId !== folderFilter) return false;
      if (tagFilter && !(row.tags ?? []).some((tag) => tag.toLowerCase() === tagFilter.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [tab, archived, inbox, folderFilter, tagFilter]);

  async function save(nextUrl = url, thenOpen = true) {
    const trimmed = normalizeSourceUrl(nextUrl);
    if (!trimmed) {
      setError("Paste a blog or X URL first.");
      return;
    }
    if (inFlight.current === trimmed && busy === "extract") return;
    setUrl(trimmed);
    writeDraftUrl(trimmed);
    inFlight.current = trimmed;
    setBusy("extract");
    setError("");
    try {
      const result = await extractArticle({ data: { url: trimmed } });
      if (inFlight.current !== trimmed) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      upsertItem(articleToItem(result.article));
      writeDraftUrl("");
      setUrl("");
      if (!thenOpen) setOpenId(null);
    } catch {
      if (inFlight.current !== trimmed) return;
      setError("Something went wrong while reading that page. Try again.");
    } finally {
      if (inFlight.current === trimmed) {
        inFlight.current = null;
        setBusy(null);
      }
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
    const draft = readDraftUrl();
    if (draft && !openId) {
      setUrl(draft);
      void save(draft, true);
    }
  }, []);

  async function buildFile(target: Article): Promise<File | null> {
    const result = await bindEpub({ data: { article: target } });
    if (!result.ok) {
      toast.error(result.error);
      return null;
    }
    return downloadBase64(result.filename, result.mime, result.base64);
  }

  async function downloadOnly() {
    if (!article) return;
    setBusy("download");
    try {
      const file = await buildFile(article);
      if (!file) return;
      markStatus(articleIdFromUrl(article.canonicalUrl || article.url), "downloaded");
      toast.success("EPUB saved. Drop it on Amazon Send to Kindle or email it.");
    } finally {
      setBusy(null);
    }
  }

  async function sendToKindle() {
    if (!article) return;
    const email = useKindleStore.getState().kindleEmail;
    if (!isKindleEmail(email)) {
      setPendingSend(true);
      setSetupOpen(true);
      return;
    }
    setBusy("send");
    try {
      const file = await buildFile(article);
      if (!file) return;
      markStatus(articleIdFromUrl(article.canonicalUrl || article.url), "sent");
      const shareData = {
        files: [file],
        title: article.title,
        text: `Send “${article.title}” to Kindle`,
      };
      if (typeof navigator.canShare === "function" && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
          toast.success("Pick Kindle, Gmail, or Files to finish delivery.");
          return;
        } catch {
          // cancelled
        }
      }
      window.open(gmailComposeUrl(email, article.title), "_blank", "noopener,noreferrer");
      toast.success("EPUB downloaded. Attach it in the email window and send.");
    } finally {
      setBusy(null);
    }
  }

  if (article && openItem) {
    return (
      <>
        <ReaderView
          item={openItem}
          article={article}
          busy={busy}
          kindleEmail={kindleEmail}
          readerSize={readerSize}
          onBack={() => setOpenId(null)}
          onArchive={() => {
            if (!openItem) return;
            archiveItem(openItem.id, !openItem.archived);
            if (!openItem.archived) {
              setOpenId(null);
              toast.success("Archived");
            } else {
              toast.success("Moved to inbox");
            }
          }}
          onSend={() => void sendToKindle()}
          onDownload={() => void downloadOnly()}
          onToggleSize={() => setReaderSize(readerSize === "lg" ? "md" : "lg")}
        />
        <SetupDialog
          open={setupOpen}
          onOpenChange={(open) => {
            setSetupOpen(open);
            if (!open && !isKindleEmail(useKindleStore.getState().kindleEmail)) {
              setPendingSend(false);
            }
          }}
          onSaved={() => {
            if (pendingSend) {
              setPendingSend(false);
              void sendToKindle();
            }
          }}
        />
      </>
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
            <p className="hidden text-xs text-muted sm:block">Read later</p>
          </div>
        </div>
        <Button variant="ghost" className="gap-2 px-3" onClick={() => setSetupOpen(true)}>
          <Settings2 className="size-4" />
          <span className="hidden sm:inline">{connected ? "Kindle" : "Connect Kindle"}</span>
        </Button>
      </header>

      <div className="relative mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
        <section className="stagger-in pt-4">
          <p className="text-sm text-muted">Save. Read here. Kindle if you want.</p>
          <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
            A quiet place to read the web.
          </h1>
          <p className="mt-3 max-w-lg text-base leading-normal text-ink-soft">
            Save a blog, essay, or X article. Read it here without the chrome. Send
            it to your Kindle only if you want it on paper.
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
                placeholder="Paste a URL to save"
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
              <Button
                type="button"
                className="sm:w-32"
                disabled={busy === "extract"}
                onClick={() => void save()}
              >
                {busy === "extract" ? (
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
              <p className="mt-2 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Public pages only. Your list stays on this device.
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
            <span className="tabular-nums text-muted">{archived.length}</span>
          </button>
        </div>

        <LibraryFilters
          folderFilter={folderFilter}
          tagFilter={tagFilter}
          onFolder={setFolderFilter}
          onTag={setTagFilter}
        />

        {busy === "extract" && !openId ? (
          <p className="mt-6 text-sm text-muted">Saving a clean copy…</p>
        ) : null}

        <ArticleList
          items={visible}
          emptyTitle={tab === "archive" ? "Nothing archived" : "Your inbox is empty"}
          emptyCopy={
            tab === "archive"
              ? "Archive a piece after you finish it. It will wait here."
              : "Paste a URL above. Read it in a quiet view, then send it to Kindle if you like."
          }
          onOpen={(item) => void openItemOrFetch(item)}
          onRemove={removeItem}
        />
      </div>

      <SetupDialog
        open={setupOpen}
        onOpenChange={(open) => {
          setSetupOpen(open);
          if (!open && !isKindleEmail(useKindleStore.getState().kindleEmail)) {
            setPendingSend(false);
          }
        }}
        onSaved={() => {
          if (pendingSend) {
            setPendingSend(false);
            void sendToKindle();
          }
        }}
      />
    </main>
  );
}
