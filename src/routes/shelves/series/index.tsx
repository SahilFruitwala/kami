import { createFileRoute } from "@tanstack/react-router";
import { MediaShelfView } from "@/components/library/media-shelf-view.tsx";
import { validateShelvesSearch } from "@/lib/shelves-search.ts";

export const Route = createFileRoute("/shelves/series/")({
  validateSearch: validateShelvesSearch,
  component: SeriesShelfPage,
});

function SeriesShelfPage() {
  const search = Route.useSearch();
  return <MediaShelfView key="tv" tab="tv" search={search} />;
}
