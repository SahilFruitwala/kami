import { statusLabels } from "@/lib/shelf-labels.ts";
import type { ShelfTab } from "@/lib/shelves.ts";

/** UI filter: `all` means no status predicate on the server. */
export type StatusFilter = "to_try" | "in_progress" | "done" | "abandoned" | "all";

/** Series and books have an in-between state; movies and wishlist don't. */
export function statusMeta(tab: ShelfTab): { id: StatusFilter; label: string }[] {
  const labels = statusLabels(tab);
  const inProgress = tab === "tv" || tab === "book";
  // In progress leads: it's the default view for series and books.
  return [
    ...(inProgress ? [{ id: "in_progress" as const, label: labels.inProgress }] : []),
    { id: "to_try", label: labels.toTry },
    { id: "done", label: labels.done },
    ...(inProgress ? [{ id: "abandoned" as const, label: labels.abandoned }] : []),
    { id: "all", label: "All" },
  ];
}

/** Default status filter per shelf. */
export function defaultStatus(tab: ShelfTab): StatusFilter {
  // Movies and series are video shelves that show every tape at once.
  if (tab === "movie" || tab === "tv") return "all";
  return tab === "book" ? "in_progress" : "to_try";
}

export function parseStatusFilter(v: unknown, tab: ShelfTab): StatusFilter {
  if (v === "done" || v === "all" || v === "to_try") return v;
  if ((v === "in_progress" || v === "abandoned") && (tab === "tv" || tab === "book")) return v;
  return defaultStatus(tab);
}

export function statusToApi(status: StatusFilter): Exclude<StatusFilter, "all"> | undefined {
  return status === "all" ? undefined : status;
}
