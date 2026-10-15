import { useDeferredValue, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { defaultStatus, parseStatusFilter, type StatusFilter } from "@/lib/shelf-status";
import { shelfPath, type ShelfTab } from "@/lib/shelves";
import type { ShelvesSearch } from "@/lib/shelves-search";

/**
 * Search + status filter for a shelf page, seeded from the URL and written
 * back to it (debounced, `replace`) so a filtered shelf is linkable. The page
 * size resets whenever the filter changes.
 */
export function useShelfFilters(tab: ShelfTab, search: ShelvesSearch, pageSize: number) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(() => search.q ?? "");
  const [status, setStatus] = useState<StatusFilter>(() => parseStatusFilter(search.status, tab));
  const [limit, setLimit] = useState(pageSize);
  const deferredQuery = useDeferredValue(query);

  const urlSearch: ShelvesSearch = {
    q: query ? query : undefined,
    status: status === defaultStatus(tab) ? undefined : status,
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      void navigate({
        to: shelfPath(tab),
        search: {
          q: query ? query : undefined,
          status: status === defaultStatus(tab) ? undefined : status,
        },
        replace: true,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [tab, query, status, navigate]);

  useEffect(() => setLimit(pageSize), [tab, status, deferredQuery, pageSize]);

  return {
    query,
    setQuery,
    deferredQuery,
    status,
    setStatus,
    limit,
    loadMore: () => setLimit((n) => n + pageSize),
    /** Current filter as URL search params (for links back to this view). */
    urlSearch,
  };
}
