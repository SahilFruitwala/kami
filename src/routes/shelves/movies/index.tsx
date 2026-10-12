import { createFileRoute } from "@tanstack/react-router";
import { MediaShelfView } from "@/components/library/media-shelf-view.tsx";
import { validateShelvesSearch } from "@/lib/shelves-search.ts";

export const Route = createFileRoute("/shelves/movies/")({
  validateSearch: validateShelvesSearch,
  component: MoviesShelfPage,
});

function MoviesShelfPage() {
  const search = Route.useSearch();
  return <MediaShelfView key="movie" tab="movie" search={search} />;
}
