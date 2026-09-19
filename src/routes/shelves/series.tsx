import { createFileRoute } from "@tanstack/react-router";
import {
  ShelvesView,
  validateShelvesSearch,
} from "@/components/library/shelves-view.tsx";

export const Route = createFileRoute("/shelves/series")({
  validateSearch: validateShelvesSearch,
  component: SeriesShelfPage,
});

function SeriesShelfPage() {
  const search = Route.useSearch();
  return <ShelvesView tab="tv" search={search} />;
}
