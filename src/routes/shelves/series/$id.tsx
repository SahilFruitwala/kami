import { createFileRoute } from "@tanstack/react-router";
import { ShelfDetailPage } from "@/components/library/shelf-detail-page.tsx";

export const Route = createFileRoute("/shelves/series/$id")({
  component: SeriesDetailRoute,
});

function SeriesDetailRoute() {
  const { id } = Route.useParams();
  return <ShelfDetailPage key={id} tab="tv" id={id} />;
}
