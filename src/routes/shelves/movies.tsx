import { createFileRoute } from "@tanstack/react-router";
import { ShelvesView } from "@/components/library/shelves-view.tsx";
import { validateShelvesSearch } from "@/lib/shelves-search.ts";

export const Route = createFileRoute("/shelves/movies")({
  validateSearch: validateShelvesSearch,
  component: MoviesShelfPage,
});

function MoviesShelfPage() {
  const search = Route.useSearch();
  return <ShelvesView key="movie" tab="movie" search={search} />;
}
