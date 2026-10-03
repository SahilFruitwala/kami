import { createFileRoute } from "@tanstack/react-router";
import { ShelvesView } from "@/components/library/shelves-view.tsx";
import { validateShelvesSearch } from "@/lib/shelves-search.ts";

export const Route = createFileRoute("/shelves/wishlist")({
  validateSearch: validateShelvesSearch,
  component: WishlistShelfPage,
});

function WishlistShelfPage() {
  const search = Route.useSearch();
  return <ShelvesView key="wishlist" tab="wishlist" search={search} />;
}
