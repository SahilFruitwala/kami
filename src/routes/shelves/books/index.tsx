import { createFileRoute } from "@tanstack/react-router";
import { ShelvesView } from "@/components/library/shelves-view.tsx";
import { validateShelvesSearch } from "@/lib/shelves-search.ts";

export const Route = createFileRoute("/shelves/books/")({
  validateSearch: validateShelvesSearch,
  component: BooksShelfPage,
});

function BooksShelfPage() {
  const search = Route.useSearch();
  return <ShelvesView key="book" tab="book" search={search} />;
}
