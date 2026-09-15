import { useState } from "react";
import { LoaderCircle } from "lucide-react";
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
          <Input placeholder="Title" value={title} onChange={(e) => onTitle(e.target.value)} />
          <Input
            placeholder="Source URL (optional)"
            value={url}
            onChange={(e) => onUrl(e.target.value)}
          />
          <textarea
            className="min-h-48 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-ink/20"
            placeholder="Paste article text or HTML"
            value={body}
            onChange={(e) => onBody(e.target.value)}
          />
          <Button type="button" className="w-full" disabled={busy} onClick={onImport}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : "Import to library"}
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
            Bypass bot walls by capturing in your browser, then sending the HTML into Quarto.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm text-ink-soft">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>Copy the Quarto bookmarklet below into a new bookmark.</li>
            <li>On any blocked article page, click that bookmark.</li>
            <li>Quarto opens with the content ready — review and import.</li>
          </ol>
          <Button
            type="button"
            className="w-full"
            disabled={!bookmarklet}
            onClick={() => void copyBookmarklet()}
          >
            Copy Quarto bookmarklet
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
            Capture runs inside this app. There is no separate API or Worker to deploy.
            Bookmarklets need a desktop browser bookmark bar — they don&apos;t work on
            mobile browsers, where Paste article is the fallback.
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
            placeholder="Work title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            placeholder="Author (optional)"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
          <textarea
            className="min-h-32 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-ink/20"
            placeholder="Transcribe the passage here…"
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
          />
          <textarea
            className="min-h-20 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-ink/20"
            placeholder="Marginalia — your note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="button" className="w-full" disabled={busy} onClick={() => void save()}>
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : "Ink slip to vault"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
