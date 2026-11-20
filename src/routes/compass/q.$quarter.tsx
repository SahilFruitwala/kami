import { createFileRoute } from "@tanstack/react-router";
import { CompassScreen } from "@/components/compass/compass-screen.tsx";

export const Route = createFileRoute("/compass/q/$quarter")({
  component: QuarterRoute,
});

function QuarterRoute() {
  const { quarter } = Route.useParams();
  return <CompassScreen view={{ page: "quarter", id: quarter }} />;
}
