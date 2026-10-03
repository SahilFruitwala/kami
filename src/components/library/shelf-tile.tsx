import { type MouseEvent } from "react";
import { toast } from "sonner";
import { Check, LoaderCircle } from "lucide-react";
import { Hanko } from "@/components/kami.tsx";
import { useSetShelfItemStatus, useSetShowWatched } from "@/hooks/use-shelf-queries.ts";
import { type ShelfCard, type ShelfTab } from "@/lib/shelves.ts";
import { cn } from "@/lib/utils.ts";
import { statusLabels } from "@/lib/shelf-labels.ts";

export function ShelfTile({
  item,
  tab,
  onOpen,
}: {
  item: ShelfCard;
  tab: ShelfTab;
  onOpen: () => void;
}) {
  const setStatus = useSetShelfItemStatus();
  const setShowWatched = useSetShowWatched();
  const labels = statusLabels(tab);
  const isDone = item.status === "done";
  const busy = setStatus.isPending || setShowWatched.isPending;

  async function toggleDone(e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      if (isDone) {
        if (tab === "tv") {
          await setShowWatched.mutateAsync({ itemId: item.id, watched: false });
        } else {
          await setStatus.mutateAsync({ type: tab, id: item.id, status: "to_try" });
        }
        toast.success(`Moved “${item.title}” back to ${labels.toTry.toLowerCase()}`);
      } else {
        if (tab === "tv") {
          await setShowWatched.mutateAsync({ itemId: item.id, watched: true });
        } else {
          await setStatus.mutateAsync({ type: tab, id: item.id, status: "done" });
        }
        toast.success(`Marked “${item.title}” ${labels.done.toLowerCase()}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update status.");
    }
  }

  return (
    <article className="kami-sheet group flex flex-col overflow-hidden transition-transform hover:-translate-y-0.5">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40 focus-visible:ring-inset"
      >
        <div className="poster-frame relative aspect-[2/3] w-full overflow-hidden bg-paper-warm">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt=""
              width={300}
              height={450}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center font-display text-4xl text-ink-faint">
              {item.title.charAt(0)}
            </div>
          )}
          {isDone ? (
            <span className="absolute top-2 right-2 z-[2]">
              <Hanko glyph="✓" title={labels.done} />
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col p-3 pb-2">
          <p className="line-clamp-2 font-display text-[15px] leading-snug font-medium text-ink">
            {item.title}
          </p>
          {item.subtitle ? (
            <p className="mt-1 line-clamp-1 font-sans text-xs text-ink-muted">{item.subtitle}</p>
          ) : null}
          {tab === "tv" && (item.totalEpisodes || item.episodesWatched) ? (
            <div className="mt-2 space-y-1">
              <p className="font-sans text-[11px] tabular-nums text-ink-muted">
                {item.episodesWatched ?? 0}
                {item.totalEpisodes ? ` / ${item.totalEpisodes}` : ""} eps
                {item.lastEpisode ? ` · Last ${item.lastEpisode}` : ""}
              </p>
              {item.totalEpisodes && item.totalEpisodes > 0 ? (
                <span
                  className="block h-1 w-full overflow-hidden rounded-full bg-paper-warm"
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-hanko"
                    style={{
                      width: `${Math.min(
                        ((item.episodesWatched ?? 0) / item.totalEpisodes) * 100,
                        100,
                      )}%`,
                    }}
                  />
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </button>
      <div className="px-3 pb-3">
        <button
          type="button"
          disabled={busy}
          onClick={(e) => void toggleDone(e)}
          aria-pressed={isDone}
          className={cn(
            "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[0.25rem] font-sans text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40 disabled:opacity-60",
            isDone
              ? "border border-line bg-surface text-ink-soft hover:bg-paper-warm hover:text-ink"
              : "bg-hanko text-white shadow-sm hover:bg-shu",
          )}
        >
          {busy ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          ) : isDone ? (
            <Check className="size-3.5 text-hanko" aria-hidden="true" />
          ) : (
            <Check className="size-3.5" aria-hidden="true" />
          )}
          {isDone ? labels.done : labels.markDone}
        </button>
      </div>
    </article>
  );
}
