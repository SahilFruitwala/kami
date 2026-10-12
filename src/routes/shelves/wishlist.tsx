import { createFileRoute } from "@tanstack/react-router";
import { MediaShelfView } from "@/components/library/media-shelf-view.tsx";
import { validateShelvesSearch } from "@/lib/shelves-search.ts";

export const Route = createFileRoute("/shelves/wishlist")({
  validateSearch: validateShelvesSearch,
  component: WishlistShelfPage,
});

function WishlistShelfPage() {
  const search = Route.useSearch();
  return <MediaShelfView key="wishlist" tab="wishlist" search={search} />;
}
