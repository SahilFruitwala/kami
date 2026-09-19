import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/shelves")({
  component: ShelvesLayout,
});

function ShelvesLayout() {
  return <Outlet />;
}
