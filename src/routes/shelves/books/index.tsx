import { createFileRoute } from "@tanstack/react-router";
import { MediaShelfView } from "@/components/library/media-shelf-view.tsx";
import { validateShelvesSearch } from "@/lib/shelves-search.ts";

export const Route = createFileRoute("/shelves/books/")({
  validateSearch: validateShelvesSearch,
  component: BooksShelfPage,
});

function BooksShelfPage() {
  const search = Route.useSearch();
  return <MediaShelfView key="book" tab="book" search={search} />;
}
