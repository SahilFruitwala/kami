import { createFileRoute } from "@tanstack/react-router";
import { ShelfDetailPage } from "@/components/library/shelf-detail-page.tsx";

export const Route = createFileRoute("/shelves/books/$id")({
  component: BookDetailRoute,
});

function BookDetailRoute() {
  const { id } = Route.useParams();
  return <ShelfDetailPage key={id} tab="book" id={id} />;
}
