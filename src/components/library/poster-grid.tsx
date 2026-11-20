import { useState, type CSSProperties } from "react";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { coverStyle } from "@/components/home/today-desk.tsx";
import {
  useDeleteShelfItem,
  useSetShelfItemStatus,
  useSetShowWatched,
} from "@/hooks/use-shelf-queries.ts";
import { confirmAction } from "@/lib/confirm.ts";
import { toastError } from "@/lib/errors";
import { previewImageSrc } from "@/lib/image-url.ts";
import { statusLabels } from "@/lib/shelf-labels.ts";
import type { ShelfCard, ShelfTab } from "@/lib/shelves.ts";

/** Front-loaded cascade, capped so a long shelf never waits on its tail. */
const delay = (i: number) => `${Math.round(Math.sqrt(Math.min(i, 16)) * 60)}ms`;

function meta(card: ShelfCard, tab: ShelfTab): string {
  if (tab === "tv" && card.totalEpisodes) {
    return `${card.episodesWatched ?? 0}/${card.totalEpisodes} eps${card.lastEpisode ? ` · ${card.lastEpisode}` : ""}`;
  }
  if (tab === "book" && card.progressPercent && card.status !== "done") {
    return `${card.progressPercent}% read`;
  }
  return [card.subtitle && tab !== "movie" ? card.subtitle : null, card.year]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Posters for Movies, Series, Books and Wishlist, with the everyday actions
 * (done / undo / delete) right on the card so nothing needs opening.
 * `filtered` is true when the list shows one status, so a card whose status
 * changes is about to leave: it fades out first instead of vanishing.
 */
export function PosterGrid({
  items,
  tab,
  filtered,
  onOpen,
}: {
  items: ShelfCard[];
  tab: ShelfTab;
  filtered: boolean;
  onOpen: (card: ShelfCard) => void;
}) {
  const labels = statusLabels(tab);
  const setStatus = useSetShelfItemStatus();
  const setShowWatched = useSetShowWatched();
  const remove = useDeleteShelfItem();
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const leave = (id: string, on: boolean) =>
    setLeaving((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function toggleDone(card: ShelfCard) {
    const done = card.status !== "done";
    if (!done && tab === "tv" && (card.episodesWatched ?? 0) > 0) {
      const n = card.episodesWatched ?? 0;
      const ok = await confirmAction({
        title: `Clear ${n} watched episode${n === 1 ? "" : "s"} of “${card.title}”?`,
        confirmLabel: "Clear",
      });
      if (!ok) return;
    }
    setBusy(card.id);
    if (filtered) leave(card.id, true);
    try {
      if (tab === "tv") await setShowWatched.mutateAsync({ itemId: card.id, watched: done });
      else
        await setStatus.mutateAsync({ type: tab, id: card.id, status: done ? "done" : "to_try" });
      toast.success(
        done
          ? `Marked “${card.title}” ${labels.done.toLowerCase()}`
          : `Moved “${card.title}” back to ${labels.toTry.toLowerCase()}`,
      );
    } catch (e) {
      leave(card.id, false);
      toastError(e, "Couldn't update status.");
    } finally {
      setBusy(null);
    }
  }

  async function del(card: ShelfCard) {
    const ok = await confirmAction({
      title: `Remove “${card.title}” from your shelf?`,
      confirmLabel: "Remove",
    });
    if (!ok) return;
    setBusy(card.id);
    leave(card.id, true);
    try {
      await remove.mutateAsync({ type: tab, id: card.id });
      toast.success(`Removed “${card.title}”`);
    } catch (e) {
      leave(card.id, false);
      toastError(e, "Couldn't remove it.");
    } finally {
      setBusy(null);
    }
  }

  const doneVerb = tab === "book" ? "Read" : tab === "wishlist" ? "Got it" : "Watched";
  const undoVerb = tab === "book" ? "Unread" : tab === "wishlist" ? "Want again" : "Unwatch";

  return (
    <ul className="rd-poster-grid" role="list">
      {items.map((card, i) => {
        const done = card.status === "done";
        return (
          <li
            key={card.id}
            className="rd-poster-card rd-enter"
            data-leaving={leaving.has(card.id) || undefined}
            data-done={done || undefined}
            style={{ "--enter-delay": delay(i) } as CSSProperties}
          >
            <div className="rd-poster-frame">
              <button
                type="button"
                className="rd-poster-open"
                onClick={() => onOpen(card)}
                aria-label={`Open ${card.title}`}
                style={coverStyle(card.id)}
              >
                {card.imageUrl ? (
                  <img src={previewImageSrc(card.imageUrl)} alt="" loading="lazy" />
                ) : (
                  <span className="rd-poster-fallback">{card.title}</span>
                )}
                {card.status === "in_progress" ? (
                  <span className="rd-badge">{labels.inProgress}</span>
                ) : done ? (
                  <span className="rd-badge rd-badge--done">
                    <Check className="size-3" aria-hidden="true" /> {labels.done}
                  </span>
                ) : null}
                {tab === "tv" && card.totalEpisodes ? (
                  <span className="rd-poster-progress" aria-hidden="true">
                    <i
                      style={{
                        transform: `scaleX(${Math.min(1, (card.episodesWatched ?? 0) / card.totalEpisodes)})`,
                      }}
                    />
                  </span>
                ) : tab === "book" && card.progressPercent ? (
                  <span className="rd-poster-progress" aria-hidden="true">
                    <i style={{ transform: `scaleX(${card.progressPercent / 100})` }} />
                  </span>
                ) : null}
              </button>
              <div className="rd-poster-actions">
                <button
                  type="button"
                  className="rd-act rd-act--main"
                  disabled={busy === card.id}
                  onClick={() => void toggleDone(card)}
                  aria-label={`${done ? undoVerb : doneVerb}: ${card.title}`}
                >
                  {done ? (
                    <RotateCcw className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Check className="size-3.5" aria-hidden="true" />
                  )}
                  {done ? undoVerb : doneVerb}
                </button>
                <button
                  type="button"
                  className="rd-act rd-act--icon"
                  disabled={busy === card.id}
                  onClick={() => void del(card)}
                  aria-label={`Remove ${card.title}`}
                  title="Remove"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
            <p className="rd-poster-title">{card.title}</p>
            <p className="rd-poster-meta">{meta(card, tab) || " "}</p>
          </li>
        );
      })}
    </ul>
  );
}
