import { BookOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { useKindleStore } from "@/lib/store.ts";

function relativeTime(ts: number): string {
  const delta = Date.now() - ts;
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function LibraryDialog({
  open,
  onOpenChange,
  onOpenUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenUrl: (url: string) => void;
}) {
  const library = useKindleStore((s) => s.library);
  const removeItem = useKindleStore((s) => s.removeItem);
  const clearLibrary = useKindleStore((s) => s.clearLibrary);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(32rem,calc(100dvh-2rem))] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Library</DialogTitle>
          <DialogDescription>
            Pieces prepared on this device. Re-open one to send it again.
          </DialogDescription>
        </DialogHeader>

        {library.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <BookOpen className="size-6 text-faint" />
            <p className="text-sm text-muted">Nothing here yet.</p>
          </div>
        ) : (
          <div className="screen-scroll -mx-2 max-h-[20rem] overflow-y-auto px-2">
            <ul className="divide-y divide-line">
              {library.map((item) => (
                <li key={item.id} className="flex items-start gap-3 py-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      onOpenUrl(item.url);
                      onOpenChange(false);
                    }}
                  >
                    <p className="truncate font-medium text-ink">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {item.source === "x" ? "X" : item.siteName} ·{" "}
                      {item.status === "sent" ? "Sent" : item.status === "downloaded" ? "Downloaded" : "Prepared"}{" "}
                      · {relativeTime(item.sentAt ?? item.preparedAt)}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 text-muted hover:text-ink"
                    aria-label={`Remove ${item.title}`}
                    onClick={() => removeItem(item.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {library.length > 0 ? (
          <button
            type="button"
            className="text-left text-sm text-muted underline decoration-line underline-offset-2 hover:text-ink"
            onClick={clearLibrary}
          >
            Clear library
          </button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
