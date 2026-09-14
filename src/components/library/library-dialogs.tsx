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
            className="min-h-48 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
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
          <p>
            Copy this bookmarklet into a bookmark. On any article page, click it to open Quarto with
            the content ready to import.
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
            Capture runs inside this app. There is no separate API or Worker to deploy.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
