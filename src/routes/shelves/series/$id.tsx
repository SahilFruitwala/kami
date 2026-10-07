import { createFileRoute } from "@tanstack/react-router";
import { ShelfDetailPage } from "@/components/library/shelf-detail-page.tsx";
import { validateShelvesSearch } from "@/lib/shelves-search.ts";

export const Route = createFileRoute("/shelves/series/$id")({
  // Carries the shelf list's filters so Back returns to the same tab.
  validateSearch: validateShelvesSearch,
  component: SeriesDetailRoute,
});

function SeriesDetailRoute() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  return <ShelfDetailPage key={id} tab="tv" id={id} listSearch={search} />;
}
