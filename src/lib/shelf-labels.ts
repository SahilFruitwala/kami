import type { ItemStatus } from "@/lib/schema.ts";
import type { ShelfTab } from "@/lib/shelves.ts";

/** Display word for an item's current status. */
export function statusText(labels: ReturnType<typeof statusLabels>, status: ItemStatus): string {
  if (status === "done") return labels.done;
  if (status === "in_progress") return labels.inProgress;
  if (status === "abandoned") return labels.abandoned;
  return labels.toTry;
}

/** Status wording per shelf type ("Watched" vs "Read" vs "Got it"). */
export function statusLabels(type: ShelfTab) {
  if (type === "book")
    return {
      inProgress: "Reading",
      abandoned: "Abandoned",
      done: "Read",
      toTry: "To read",
      markDone: "Mark read",
      markTry: "Mark unread",
    };
  if (type === "wishlist")
    return {
      inProgress: "In progress",
      abandoned: "Dropped",
      done: "Got it",
      toTry: "Wanted",
      markDone: "Mark got it",
      markTry: "Mark wanted",
    };
  return {
    inProgress: "Watching",
    abandoned: "Dropped",
    done: "Watched",
    toTry: "To watch",
    markDone: "Mark watched",
    markTry: "Mark unwatched",
  };
}
