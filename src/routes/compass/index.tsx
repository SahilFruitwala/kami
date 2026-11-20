import { createFileRoute } from "@tanstack/react-router";
import { CompassScreen } from "@/components/compass/compass-screen.tsx";

export const Route = createFileRoute("/compass/")({
  component: () => <CompassScreen view={{ page: "overview" }} />,
});
