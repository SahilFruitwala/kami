import type { ShelfTab } from "@/lib/shelves-fns.ts";

/** Status wording per shelf type ("Watched" vs "Read" vs "Got it"). */
export function statusLabels(type: ShelfTab) {
  if (type === "book")
    return { done: "Read", toTry: "To read", markDone: "Mark read", markTry: "Mark unread" };
  if (type === "wishlist")
    return { done: "Got it", toTry: "Wanted", markDone: "Mark got it", markTry: "Mark wanted" };
  return {
    done: "Watched",
    toTry: "To watch",
    markDone: "Mark watched",
    markTry: "Mark unwatched",
  };
}
