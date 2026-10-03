import { toast } from "sonner";
import { Check, LoaderCircle, Trash2 } from "lucide-react";
import { EpisodeTracker } from "@/components/library/episode-tracker.tsx";
import { WatchWhere } from "@/components/library/watch-where.tsx";
import { WashiTag } from "@/components/kami.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  useDeleteShelfItem,
  useSetShelfItemStatus,
  useSetShowWatched,
} from "@/hooks/use-shelf-queries.ts";
import { type ShelfDetail } from "@/lib/shelves-fns.ts";
import { statusLabels } from "@/lib/shelf-labels.ts";

export function ShelfFolio({ detail, onClose }: { detail: ShelfDetail; onClose: () => void }) {
  const setStatus = useSetShelfItemStatus();
  const deleteItem = useDeleteShelfItem();
  const setShowWatched = useSetShowWatched();
  const genres = detail.type === "wishlist" ? [] : detail.genres;
  const overview =
    detail.type === "movie" || detail.type === "tv" || detail.type === "book"
      ? detail.item.overview
      : detail.item.description;
  const labels = statusLabels(detail.type);
  const busy = setStatus.isPending || deleteItem.isPending || setShowWatched.isPending;
  const isDone = detail.item.status === "done";

  async function markDone() {
    try {
      if (detail.type === "tv") {
        await setShowWatched.mutateAsync({ itemId: detail.item.id, watched: true });
      } else {
        await setStatus.mutateAsync({ type: detail.type, id: detail.item.id, status: "done" });
      }
      toast.success(`Marked “${detail.item.title}” ${labels.done.toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update status.");
    }
  }

  async function markToTry() {
    try {
      if (detail.type === "tv") {
        await setShowWatched.mutateAsync({ itemId: detail.item.id, watched: false });
      } else {
        await setStatus.mutateAsync({ type: detail.type, id: detail.item.id, status: "to_try" });
      }
      toast.success(`Moved “${detail.item.title}” back to ${labels.toTry.toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update status.");
    }
  }

  async function remove() {
    if (!window.confirm(`Remove “${detail.item.title}” from your shelf?`)) return;
    try {
      await deleteItem.mutateAsync({ type: detail.type, id: detail.item.id });
      toast.success(`Removed “${detail.item.title}”`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete that item.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="poster-frame relative w-24 shrink-0 overflow-hidden rounded-[0.25rem] bg-paper-warm">
          {detail.item.imageUrl ? (
            <img
              src={detail.item.imageUrl}
              alt=""
              width={96}
              height={144}
              className="aspect-[2/3] w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[2/3] w-full items-center justify-center font-display text-3xl text-ink-faint">
              {detail.item.title.charAt(0)}
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <WashiTag tone={isDone ? "vermilion" : "paper"}>
              {detail.item.status === "done" ? labels.done : labels.toTry}
            </WashiTag>
            {genres.map((g) => (
              <WashiTag key={g} tone="bamboo">
                {g}
              </WashiTag>
            ))}
          </div>
          {(detail.type === "movie" || detail.type === "tv") && detail.item.tmdbId != null ? (
            <WatchWhere tmdbId={String(detail.item.tmdbId)} kind={detail.type} />
          ) : null}
          <dl className="space-y-1 font-sans text-xs text-ink-muted">
            {detail.type === "movie" && detail.item.releaseYear ? (
              <div className="flex gap-2">
                <dt>Year</dt>
                <dd className="text-ink">{detail.item.releaseYear}</dd>
              </div>
            ) : null}
            {detail.type === "tv" ? (
              <>
                {detail.item.releaseYear ? (
                  <div className="flex gap-2">
                    <dt>Year</dt>
                    <dd className="text-ink">{detail.item.releaseYear}</dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt>Progress</dt>
                  <dd className="text-ink tabular-nums">
                    {detail.item.episodesWatched ?? 0}
                    {detail.item.totalEpisodes
                      ? ` / ${detail.item.totalEpisodes}`
                      : ` ticked (${detail.episodesTicked})`}
                    {detail.item.lastEpisode ? ` · ${detail.item.lastEpisode}` : ""}
                  </dd>
                </div>
              </>
            ) : null}
            {detail.type === "book" ? (
              <>
                {detail.item.author ? (
                  <div className="flex gap-2">
                    <dt>Author</dt>
                    <dd className="text-ink">{detail.item.author}</dd>
                  </div>
                ) : null}
                {detail.item.publishYear ? (
                  <div className="flex gap-2">
                    <dt>Published</dt>
                    <dd className="text-ink">{detail.item.publishYear}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
            {detail.type === "wishlist" ? (
              <>
                {detail.item.price ? (
                  <div className="flex gap-2">
                    <dt>Price</dt>
                    <dd className="text-ink">{detail.item.price}</dd>
                  </div>
                ) : null}
                {detail.item.source ? (
                  <div className="flex gap-2">
                    <dt>Source</dt>
                    <dd className="text-ink">{detail.item.source}</dd>
                  </div>
                ) : null}
              </>
            ) : null}
            {detail.item.link ? (
              <div>
                <a
                  href={detail.item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-accent underline underline-offset-2"
                >
                  Open reference
                </a>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {isDone ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void markToTry()}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {labels.markTry}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void markDone()}
            className="bg-hanko text-white hover:bg-shu"
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            {labels.markDone}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void remove()}
          className="text-hanko hover:bg-hanko/10 hover:text-shu"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Remove
        </Button>
      </div>

      {overview ? (
        <p className="font-serif text-[15px] leading-relaxed text-ink-soft text-pretty">
          {overview}
        </p>
      ) : null}
      {detail.item.notes ? (
        <div className="rounded-[0.25rem] bg-paper-warm p-3">
          <p className="kami-label text-ink-muted">Marginalia</p>
          <p className="mt-1 font-serif text-sm text-ink italic">{detail.item.notes}</p>
        </div>
      ) : null}

      {detail.type === "tv" ? (
        <div className="border-t border-line pt-3">
          <EpisodeTracker itemId={detail.item.id} />
        </div>
      ) : null}
    </div>
  );
}
