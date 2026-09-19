import { createFileRoute } from "@tanstack/react-router";
import {
  ShelvesView,
  validateShelvesSearch,
} from "@/components/library/shelves-view.tsx";

export const Route = createFileRoute("/shelves/books")({
  validateSearch: validateShelvesSearch,
  component: BooksShelfPage,
});

function BooksShelfPage() {
  const search = Route.useSearch();
  return <ShelvesView tab="book" search={search} />;
}
