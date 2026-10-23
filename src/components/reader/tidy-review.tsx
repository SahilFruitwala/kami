import { useMemo, useState } from "react";
import { Eraser, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { aiApi, type TidyResult } from "@/lib/api/ai";
import { toastError } from "@/lib/errors.ts";
import { rewriteHtmlImages } from "@/lib/image-url.ts";
import { useLibraryStore } from "@/lib/store.ts";
import type { LibraryItem } from "@/lib/library-item.ts";
import { cn } from "@/lib/utils.ts";
import { useInvalidateArticleSummary, useTidyArticle } from "@/hooks/use-ai.ts";

/**
 * "Remove ads & clutter": the model picks the blocks to drop and the server
 * saves the cleaned copy, keeping the Original copy. The reader then sees
 * the copy before and after, and can keep it or restore the original.
 */
export function TidyButton({ item }: { item: LibraryItem }) {
  const [result, setResult] = useState<TidyResult | null>(null);
  const tidy = useTidyArticle(item.id);
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const invalidateSummary = useInvalidateArticleSummary();
  function run() {
    tidy.mutate(undefined, {
      onSuccess: (res) => {
        // Already saved on the server; mirror it locally without re-syncing.
        upsertItem(res.item, { sync: false });
        if (!res.removed.length) {
          toast.success("Nothing to tidy: this copy is all the piece itself.");
          return;
        }
        invalidateSummary(item.id);
        setResult(res);
      },
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={tidy.isPending}
        title="Remove ads, sponsor slots, subscribe prompts and footers"
        className="flex items-center gap-1.5 font-sans text-[11px] opacity-60 transition-opacity hover:opacity-100 disabled:opacity-40"
      >
        {tidy.isPending ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Eraser className="size-3.5" aria-hidden="true" />
        )}
        {tidy.isPending ? "Cleaning…" : "Remove ads & clutter"}
      </button>
      {result ? (
        <TidyReview
          item={item}
          originalHtml={result.originalHtml}
          cleanedHtml={result.item.contentHtml}
          removed={result.removed}
          onClose={() => setResult(null)}
        />
      ) : null}
    </>
  );
}

type Pane = "before" | "after";

/**
 * Compare the Original copy with the cleaned one. The clean-up is already
 * saved: keeping it just closes; restoring puts the original back.
 */
export function TidyReview({
  item,
  originalHtml,
  cleanedHtml,
  removed,
  onClose,
}: {
  item: LibraryItem;
  originalHtml: string;
  cleanedHtml: string;
  /** Previews of the removed blocks, when known. */
  removed?: string[];
  onClose: () => void;
}) {
  const invalidateSummary = useInvalidateArticleSummary();
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  // Narrow screens show one copy at a time; wide ones show both.
  const [pane, setPane] = useState<Pane>("after");
  const [restoring, setRestoring] = useState(false);
  const before = useMemo(() => rewriteHtmlImages(originalHtml), [originalHtml]);
  const after = useMemo(() => rewriteHtmlImages(cleanedHtml), [cleanedHtml]);

  async function restore() {
    setRestoring(true);
    try {
      upsertItem(await aiApi.restoreOriginal(item.id), { sync: false });
      invalidateSummary(item.id);
      toast.success("Restored the original copy");
      onClose();
    } catch (err) {
      toastError(err, "Could not restore the original.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Review the clean-up</DialogTitle>
          <DialogDescription>
            {removed?.length
              ? `${removed.length} block${removed.length === 1 ? " was" : "s were"} removed as clutter.`
              : "Ads, sponsor slots and footers were removed from this copy."}{" "}
            Keep the cleaned copy, or restore the original.
          </DialogDescription>
        </DialogHeader>

        {removed?.length ? (
          <details className="rounded-lg bg-ink/5 px-3 py-2 font-sans text-xs">
            <summary className="cursor-pointer font-medium">What was removed</summary>
            <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-4 text-ink-soft">
              {removed.map((preview, i) => (
                <li key={i} className="break-words">
                  {preview}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div role="tablist" aria-label="Copy to preview" className="flex gap-1 md:hidden">
          {(["before", "after"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pane === id}
              onClick={() => setPane(id)}
              className={cn(
                "rounded-full px-3 py-1.5 font-sans text-xs font-medium capitalize",
                pane === id ? "bg-ink text-paper" : "bg-ink/5 text-ink-soft",
              )}
            >
              {id}
            </button>
          ))}
        </div>

        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <Preview
            label="Before"
            html={before}
            className={pane === "before" ? "" : "max-md:hidden"}
          />
          <Preview label="After" html={after} className={pane === "after" ? "" : "max-md:hidden"} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => void restore()} disabled={restoring}>
            {restoring ? "Restoring…" : "Restore original"}
          </Button>
          <Button onClick={onClose}>Keep cleaned copy</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Preview({ label, html, className }: { label: string; html: string; className?: string }) {
  return (
    <section aria-label={label} className={cn("min-w-0 space-y-2", className)}>
      <p className="kami-label opacity-60">{label}</p>
      <div className="max-h-[50vh] overflow-y-auto rounded-lg bg-surface p-4 shadow-border">
        <div className="reader-body" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </section>
  );
}
