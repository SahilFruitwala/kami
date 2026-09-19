import { createFileRoute } from "@tanstack/react-router";
import {
  ShelvesView,
  validateShelvesSearch,
} from "@/components/library/shelves-view.tsx";

export const Route = createFileRoute("/shelves/movies")({
  validateSearch: validateShelvesSearch,
  component: MoviesShelfPage,
});

function MoviesShelfPage() {
  const search = Route.useSearch();
  return <ShelvesView key="movie" tab="movie" search={search} />;
}
