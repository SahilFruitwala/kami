import { useState } from "react";
import { Check, LoaderCircle, Trash2 } from "lucide-react";
import { EpisodeTracker } from "@/components/library/episode-tracker.tsx";
import { WatchWhere } from "@/components/library/watch-where.tsx";
import { WashiTag } from "@/components/kami.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useShelfItemActions } from "@/hooks/use-shelf-item-actions.ts";
import { statusText } from "@/lib/shelf-labels.ts";
import { type ShelfDetail } from "@/lib/shelves.ts";

export function ShelfFolio({ detail, onClose }: { detail: ShelfDetail; onClose: () => void }) {
  const genres = detail.type === "wishlist" ? [] : detail.genres;
  const overview =
    detail.type === "movie" || detail.type === "tv" || detail.type === "book"
      ? detail.item.overview
      : detail.item.description;
  const { busy, labels, setDone, remove } = useShelfItemActions(detail, onClose);
  const isDone = detail.item.status === "done";
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const cover =
    detail.item.imageUrl && detail.item.imageUrl !== brokenSrc ? detail.item.imageUrl : null;

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="poster-frame relative w-24 shrink-0 overflow-hidden rounded-lg bg-paper-warm">
          {cover ? (
            <img
              src={cover}
              onError={() => setBrokenSrc(cover)}
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
              {statusText(labels, detail.item.status)}
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
                  className="text-ink underline underline-offset-2"
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
            onClick={() => void setDone(false)}
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {labels.markTry}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void setDone(true)}
            className="bg-hanko text-paper hover:bg-shu"
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
        <p className="font-display text-[15px] leading-relaxed text-ink-soft text-pretty">
          {overview}
        </p>
      ) : null}
      {detail.item.notes ? (
        <div className="rounded-lg bg-paper-warm p-3">
          <p className="kami-label text-ink-muted">Marginalia</p>
          <p className="mt-1 font-display text-sm text-ink italic">{detail.item.notes}</p>
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
