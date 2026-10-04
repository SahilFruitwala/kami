import { useState } from "react";
import { Link2, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { importArticle } from "@/lib/article-fns.ts";
import { articleToItem, useLibraryStore, type LibraryItem } from "@/lib/store.ts";
import { MAX_BULK_URLS } from "@/hooks/use-bulk-save.ts";

type PasteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  url: string;
  busy: boolean;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
  onUrl: (value: string) => void;
  onImport: () => void;
};

export function PasteDialog({
  open,
  onOpenChange,
  title,
  body,
  url,
  busy,
  onTitle,
  onBody,
  onUrl,
  onImport,
}: PasteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Paste article</DialogTitle>
          <DialogDescription>
            When automatic capture is blocked, paste the title and body from the page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input aria-label="Article title" placeholder="Title — e.g. How Great Essays Work…" value={title} onChange={(e) => onTitle(e.target.value)} name="paste-title" autoComplete="off" />
          <Input
            aria-label="Source URL (optional)"
            placeholder="Source URL — e.g. https://example.com/essay…"
            value={url}
            onChange={(e) => onUrl(e.target.value)}
            type="url"
            inputMode="url"
            name="paste-url"
            autoComplete="off"
            spellCheck={false}
          />
          <textarea
            aria-label="Article text"
            className="min-h-48 w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-ink/20"
            placeholder="Paste article text or HTML…"
            value={body}
            onChange={(e) => onBody(e.target.value)}
            name="paste-body"
          />
          <Button type="button" className="w-full" disabled={busy} onClick={onImport}>
            {busy ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Importing…
              </>
            ) : (
              "Import to Library"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ToolsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmarklet: string;
};

export function ToolsDialog({ open, onOpenChange, bookmarklet }: ToolsDialogProps) {
  async function copyBookmarklet() {
    if (!bookmarklet) {
      toast.error("Bookmarklet is not ready yet — close and try again.");
      return;
    }
    try {
      await navigator.clipboard.writeText(bookmarklet);
      toast.success("Bookmarklet copied — paste it as a new bookmark URL");
    } catch {
      // Clipboard API fails on insecure contexts / denied permissions.
      // Fall back to a hidden textarea + execCommand so users can copy manually.
      try {
        const ta = document.createElement("textarea");
        ta.value = bookmarklet;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast.success("Bookmarklet copied — paste it as a new bookmark URL");
      } catch {
        toast.error("Could not copy — select the code below manually");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Capture tools</DialogTitle>
          <DialogDescription>
            Bypass bot walls and logins by capturing the page in your browser, then handing it to
            KAMI.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm text-ink-soft">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Copy the KAMI bookmarklet below into a new bookmark.</li>
            <li>On any article page, click that bookmark.</li>
            <li>KAMI opens in a new tab and saves a clean copy — no length limit.</li>
          </ol>
          <Button
            type="button"
            className="w-full"
            disabled={!bookmarklet}
            onClick={() => void copyBookmarklet()}
          >
            Copy KAMI bookmarklet
          </Button>
          {bookmarklet ? (
            <details className="rounded-md border border-line bg-paper-warm p-2">
              <summary className="cursor-pointer text-xs font-medium text-ink-muted">
                Manual copy — show bookmarklet code
              </summary>
              <code className="mt-2 block max-h-32 overflow-y-auto break-all text-[11px] leading-relaxed text-ink-muted select-all">
                {bookmarklet}
              </code>
            </details>
          ) : (
            <p className="text-xs text-ink-muted" role="status">
              Preparing bookmarklet…
            </p>
          )}
          <p className="text-xs text-ink-muted">
            Prefer a toolbar button? Load the <strong>Save to KAMI</strong> extension from the
            repo&apos;s <code>extension/</code> folder (Chrome, Edge, Firefox) — one click or
            Alt+Shift+K. On Android, install KAMI to your home screen and use{" "}
            <strong>Share → KAMI</strong>. Elsewhere on mobile, Paste article is the fallback.
          </p>
          <p className="text-xs text-ink-muted">
            The bookmarklet opens KAMI as a pop-up; if nothing arrives, allow pop-ups for that site.
            Bookmarks made before this update still work but can truncate long articles — copy a
            fresh one.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type TranscribeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenItem?: (item: LibraryItem) => void;
};

export function BulkSaveDialog({
  open,
  onOpenChange,
  draft,
  urls,
  overflow,
  busy,
  progress,
  onDraft,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: string;
  urls: string[];
  overflow: boolean;
  busy: boolean;
  progress: { done: number; total: number };
  onDraft: (value: string) => void;
  onSave: () => void;
}) {
  const pct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-full max-w-[calc(100dvw-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk save links</DialogTitle>
          <DialogDescription className="break-words">
            Paste up to {MAX_BULK_URLS} links — one per line, or separated by commas
            or spaces. Titles are fetched right away; anything that resists
            finishes loading when you open it.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-3">
          <textarea
            aria-label="Links to save"
            className="min-h-48 w-full max-w-full rounded-md border border-line bg-surface px-3.5 py-2.5 font-mono text-[13px] leading-relaxed break-all text-ink outline-none placeholder:font-sans placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-ink/20"
            placeholder={"https://example.com/essay\nhttps://x.com/user/status/123…"}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            name="bulk-links"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="font-sans text-xs text-ink-muted" role="status" aria-live="polite">
            {urls.length === 0 ? (
              "No links detected yet."
            ) : (
              <>
                {urls.length} {urls.length === 1 ? "link" : "links"} ready
                {overflow ? ` — only the first ${MAX_BULK_URLS} will save` : ""}
              </>
            )}
          </p>
          {urls.length > 0 ? (
            <ul className="max-h-32 min-w-0 space-y-1 overflow-x-hidden overflow-y-auto rounded-md bg-bg/60 p-2" aria-label="Detected links">
              {urls.slice(0, 8).map((u) => (
                <li
                  key={u}
                  title={u}
                  className="block w-full min-w-0 truncate font-mono text-[11px] text-ink-muted"
                >
                  {u}
                </li>
              ))}
              {urls.length > 8 ? (
                <li className="font-sans text-[11px] text-ink-muted">
                  …and {urls.length - 8} more
                </li>
              ) : null}
            </ul>
          ) : null}
          <Button type="button" className="w-full" disabled={busy || urls.length === 0} onClick={onSave}>
            {busy ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Saving {progress.total > 0 ? `${progress.done}/${progress.total}` : urls.length}{" "}
                {urls.length === 1 ? "link" : "links"}…
              </>
            ) : (
              <>
                <Link2 className="size-4" aria-hidden="true" />
                Save {urls.length > 0 ? urls.length : ""} {urls.length === 1 ? "link" : "links"}
              </>
            )}
          </Button>
          {busy && progress.total > 1 ? (
            <div role="status" aria-live="polite">
              <div
                className="h-1 overflow-hidden rounded-full bg-paper-warm"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                aria-label="Bulk save progress"
              >
                <div
                  className="h-full rounded-full bg-hanko transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1.5 font-sans text-[11px] text-ink-muted tabular-nums">
                Fetching titles… {progress.done}/{progress.total}
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Manual transcription: ink a physical-book excerpt as a vault slip. */
export function TranscribeDialog({ open, onOpenChange, onOpenItem }: TranscribeDialogProps) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [passage, setPassage] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const addHighlight = useLibraryStore((s) => s.addHighlight);
  const setHighlightNote = useLibraryStore((s) => s.setHighlightNote);

  function reset() {
    setTitle("");
    setAuthor("");
    setPassage("");
    setNote("");
  }

  async function save() {
    if (!title.trim() || !passage.trim()) {
      toast.error("Add a work title and the passage text.");
      return;
    }
    if (passage.trim().length < 8) {
      toast.error("Passage needs at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const result = await importArticle({
        data: { title: title.trim(), contentText: passage.trim() },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const item = articleToItem(result.article, { author: author.trim() });
      upsertItem(item);
      const highlight = addHighlight(item.id, passage.trim());
      if (highlight && note.trim()) setHighlightNote(item.id, highlight.id, note.trim());
      toast.success("Slip inked to the vault");
      reset();
      onOpenChange(false);
      onOpenItem?.(item);
    } catch {
      toast.error("Could not ink that slip. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ink new slip</DialogTitle>
          <DialogDescription>
            Transcribe a physical-book excerpt — it is pressed into the vault as a highlight slip.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            aria-label="Work title"
            placeholder="Work title — e.g. The Rings of Saturn…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            name="slip-title"
            autoComplete="off"
          />
          <Input
            aria-label="Author (optional)"
            placeholder="Author — e.g. W. G. Sebald…"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            name="slip-author"
            autoComplete="off"
          />
          <textarea
            aria-label="Passage text"
            className="min-h-32 w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-ink/20"
            placeholder="Transcribe the passage here…"
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            name="slip-passage"
          />
          <textarea
            aria-label="Marginalia note (optional)"
            className="min-h-20 w-full rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-ink/20"
            placeholder="Marginalia — your note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            name="slip-note"
          />
          <Button type="button" className="w-full" disabled={busy} onClick={() => void save()}>
            {busy ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Inking…
              </>
            ) : (
              "Ink Slip to Vault"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
