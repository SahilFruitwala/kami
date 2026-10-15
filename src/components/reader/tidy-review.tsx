import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { rewriteHtmlImages } from "@/lib/image-url.ts";
import { queryKeys } from "@/lib/query-client.ts";
import { useLibraryStore } from "@/lib/store.ts";
import type { LibraryItem } from "@/lib/library-item.ts";
import { cn } from "@/lib/utils.ts";
import { toastError } from "@/lib/errors";

/**
 * "Remove ads & clutter": the model picks the blocks to drop, then the
 * reader sees the copy before and after. Nothing is saved until they confirm.
 */
export function TidyButton({ item }: { item: LibraryItem }) {
  const [result, setResult] = useState<TidyResult | null>(null);
  const tidy = useMutation({
    mutationFn: () => aiApi.tidy(item.id),
    onSuccess: (res) => {
      if (!res.removed.length) {
        toast.success("Nothing to tidy: this copy is all the piece itself.");
        return;
      }
      setResult(res);
    },
    onError: (err) => toastError(err, "Could not tidy this copy."),
  });
  return (
    <>
      <button
        type="button"
        onClick={() => tidy.mutate()}
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
      {result ? <TidyReview item={item} result={result} onClose={() => setResult(null)} /> : null}
    </>
  );
}

type Pane = "before" | "after";

function TidyReview({
  item,
  result,
  onClose,
}: {
  item: LibraryItem;
  result: TidyResult;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  // Narrow screens show one copy at a time; wide ones show both.
  const [pane, setPane] = useState<Pane>("after");
  const before = useMemo(() => rewriteHtmlImages(result.originalHtml), [result.originalHtml]);
  const after = useMemo(() => rewriteHtmlImages(result.contentHtml), [result.contentHtml]);
  const count = result.removed.length;

  function save() {
    const previous = item;
    upsertItem({ ...item, contentHtml: result.contentHtml });
    void client.invalidateQueries({ queryKey: queryKeys.ai.summary(item.id) });
    onClose();
    toast.success(`Removed ${count} block${count === 1 ? "" : "s"} of clutter`, {
      action: {
        label: "Undo",
        onClick: () => {
          upsertItem(previous);
          void client.invalidateQueries({ queryKey: queryKeys.ai.summary(item.id) });
        },
      },
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Review the tidy copy</DialogTitle>
          <DialogDescription>
            {count} block{count === 1 ? "" : "s"} would be removed. Nothing is saved until you
            confirm.
          </DialogDescription>
        </DialogHeader>

        <details className="rounded-lg bg-ink/5 px-3 py-2 font-sans text-xs">
          <summary className="cursor-pointer font-medium">What gets removed</summary>
          <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-4 text-ink-soft">
            {result.removed.map((preview, i) => (
              <li key={i} className="break-words">
                {preview}
              </li>
            ))}
          </ul>
        </details>

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
          <Button variant="outline" onClick={onClose}>
            Keep original
          </Button>
          <Button onClick={save}>Save tidy copy</Button>
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
