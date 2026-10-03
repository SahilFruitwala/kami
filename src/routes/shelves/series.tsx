import { createFileRoute } from "@tanstack/react-router";
import { ShelvesView } from "@/components/library/shelves-view.tsx";
import { validateShelvesSearch } from "@/lib/shelves-search.ts";

export const Route = createFileRoute("/shelves/series")({
  validateSearch: validateShelvesSearch,
  component: SeriesShelfPage,
});

function SeriesShelfPage() {
  const search = Route.useSearch();
  return <ShelvesView key="tv" tab="tv" search={search} />;
}
