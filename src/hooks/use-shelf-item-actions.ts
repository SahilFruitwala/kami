import { toast } from "sonner";
import {
  useDeleteShelfItem,
  useSetShelfItemStatus,
  useSetShowWatched,
} from "@/hooks/use-shelf-queries.ts";
import { statusLabels } from "@/lib/shelf-labels.ts";
import type { ShelfDetail } from "@/lib/shelves.ts";

/** Mark done / back to-try / remove for one shelf item, with toasts. */
export function useShelfItemActions(detail: ShelfDetail, onRemoved: () => void) {
  const setStatus = useSetShelfItemStatus();
  const deleteItem = useDeleteShelfItem();
  const setShowWatched = useSetShowWatched();
  const labels = statusLabels(detail.type);
  const { id, title } = detail.item;
  const busy = setStatus.isPending || deleteItem.isPending || setShowWatched.isPending;

  async function setDone(done: boolean) {
    if (!done && detail.type === "tv" && detail.item.episodesWatched > 0) {
      const n = detail.item.episodesWatched;
      if (!window.confirm(`Clear ${n} watched episode${n === 1 ? "" : "s"} of “${title}”?`)) return;
    }
    try {
      if (detail.type === "tv") {
        await setShowWatched.mutateAsync({ itemId: id, watched: done });
      } else {
        await setStatus.mutateAsync({
          type: detail.type,
          id,
          status: done ? "done" : "to_try",
        });
      }
      toast.success(
        done
          ? `Marked “${title}” ${labels.done.toLowerCase()}`
          : `Moved “${title}” back to ${labels.toTry.toLowerCase()}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update status.");
    }
  }

  /** Books only — series move to "watching" on their own as episodes are ticked. */
  async function startReading() {
    if (detail.type !== "book") return;
    try {
      await setStatus.mutateAsync({ type: "book", id, status: "in_progress" });
      toast.success(`Started “${title}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update status.");
    }
  }

  /** Drop a series or abandon a book; resume puts it back where progress says. */
  async function setAbandoned(abandoned: boolean) {
    if (detail.type !== "tv" && detail.type !== "book") return;
    const status = abandoned
      ? "abandoned"
      : detail.type === "tv" && detail.item.episodesWatched === 0
        ? "to_try"
        : "in_progress";
    try {
      await setStatus.mutateAsync({ type: detail.type, id, status });
      toast.success(
        abandoned
          ? `Marked “${title}” ${labels.abandoned.toLowerCase()}`
          : `Picked “${title}” back up`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update status.");
    }
  }

  async function remove() {
    if (!window.confirm(`Remove “${title}” from your shelf?`)) return;
    try {
      await deleteItem.mutateAsync({ type: detail.type, id });
      toast.success(`Removed “${title}”`);
      onRemoved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete that item.");
    }
  }

  return { busy, labels, setDone, startReading, setAbandoned, remove };
}
