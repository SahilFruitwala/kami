import { createFileRoute } from "@tanstack/react-router";
import { ShelfDetailPage } from "@/components/library/shelf-detail-page.tsx";

export const Route = createFileRoute("/shelves/movies/$id")({
  component: MovieDetailRoute,
});

function MovieDetailRoute() {
  const { id } = Route.useParams();
  return <ShelfDetailPage key={id} tab="movie" id={id} />;
}
