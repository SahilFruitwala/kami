import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, LoaderCircle, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useAddShelfItem } from "@/hooks/use-shelf-queries.ts";
import { aiApi, type ShelfRec } from "@/lib/api/ai";
import { previewImageSrc } from "@/lib/image-url.ts";

type RecType = "movie" | "tv" | "book";

/** "Suggest" on a movie, TV or book shelf: picks from the model, one tap to add. */
export function ShelfRecs({ type, onClose }: { type: RecType; onClose: () => void }) {
  const recs = useMutation({
    mutationFn: () => aiApi.recommend(type),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not get suggestions."),
  });
  // Ask once when the panel opens; "More" asks again.
  const started = useRef(false);
  const { mutate } = recs;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);

  return (
    <section aria-label="Suggestions" className="kami-sheet mt-6 space-y-4 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <p className="mr-auto flex items-center gap-2 font-sans text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-hanko" aria-hidden="true" />
          Suggested for you
        </p>
        <button
          type="button"
          onClick={() => recs.mutate()}
          disabled={recs.isPending}
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-warm hover:text-ink disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          More
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close suggestions"
          className="flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-paper-warm hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {recs.isPending ? (
        <p className="flex items-center gap-1.5 font-sans text-xs text-ink-muted">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          Looking over your shelf…
        </p>
      ) : recs.data ? (
        recs.data.recs.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {recs.data.recs.map((rec) => (
              <RecCard key={rec.title} type={type} rec={rec} />
            ))}
          </ul>
        ) : (
          <p className="font-body text-sm text-ink-muted">
            No new suggestions this time. Try More.
          </p>
        )
      ) : recs.isError ? (
        <p className="font-body text-sm text-ink-muted">
          {recs.error instanceof Error ? recs.error.message : "Could not get suggestions."}
        </p>
      ) : null}
    </section>
  );
}

function RecCard({ type, rec }: { type: RecType; rec: ShelfRec }) {
  const addItem = useAddShelfItem();
  const [added, setAdded] = useState(false);
  const match = rec.match;

  async function add() {
    try {
      const metadata = Object.fromEntries(
        Object.entries(match?.metadata ?? {}).filter(([, v]) => v.trim() !== ""),
      );
      await addItem.mutateAsync({
        type,
        title: rec.title,
        link: match?.link?.trim() || undefined,
        imageUrl: match?.imageUrl?.trim() || undefined,
        metadata: Object.keys(metadata).length ? metadata : undefined,
        status: "to_try",
      });
      setAdded(true);
      toast.success(`Added “${rec.title}”`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that.");
    }
  }

  return (
    <li className="flex list-none gap-3 rounded-lg bg-bg/70 p-3">
      {match?.imageUrl ? (
        <img
          src={previewImageSrc(match.imageUrl)}
          alt=""
          width="56"
          height="84"
          loading="lazy"
          decoding="async"
          className="h-21 w-14 shrink-0 rounded-[0.25rem] object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-sans text-sm font-semibold text-ink">{rec.title}</p>
        {rec.subtitle ? (
          <p className="font-sans text-[11px] text-ink-muted">{rec.subtitle}</p>
        ) : null}
        <p className="font-body text-xs leading-snug text-ink-soft">{rec.why}</p>
        <button
          type="button"
          onClick={() => void add()}
          disabled={added || addItem.isPending}
          className="mt-auto inline-flex w-fit items-center gap-1 pt-1 font-sans text-[11px] font-medium text-hanko transition-colors hover:text-shu disabled:text-ink-muted"
        >
          {added ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : addItem.isPending ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-3.5" aria-hidden="true" />
          )}
          {added ? "On your shelf" : "Add to shelf"}
        </button>
      </div>
    </li>
  );
}
