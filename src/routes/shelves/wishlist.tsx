import { createFileRoute } from "@tanstack/react-router";
import {
  ShelvesView,
  validateShelvesSearch,
} from "@/components/library/shelves-view.tsx";

export const Route = createFileRoute("/shelves/wishlist")({
  validateSearch: validateShelvesSearch,
  component: WishlistShelfPage,
});

function WishlistShelfPage() {
  const search = Route.useSearch();
  return <ShelvesView tab="wishlist" search={search} />;
}
