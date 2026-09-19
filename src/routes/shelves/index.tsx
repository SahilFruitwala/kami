import { createFileRoute, redirect } from "@tanstack/react-router";
import { shelfPath, shelfTabFromParam } from "@/lib/shelves-fns.ts";

type LegacySearch = {
  tab?: string;
  q?: string;
  status?: string;
};

/**
 * `/shelves` and legacy `?tab=` deep links redirect to the per-type pages.
 */
export const Route = createFileRoute("/shelves/")({
  validateSearch: (search: Record<string, unknown>): LegacySearch => ({
    tab: typeof search.tab === "string" && search.tab.length > 0 ? search.tab : undefined,
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    status:
      typeof search.status === "string" && search.status.length > 0 ? search.status : undefined,
  }),
  beforeLoad: ({ search }) => {
    const tab = shelfTabFromParam(search.tab) ?? "movie";
    throw redirect({
      to: shelfPath(tab),
      search: {
        q: search.q,
        status: search.status,
      },
      replace: true,
    });
  },
});
