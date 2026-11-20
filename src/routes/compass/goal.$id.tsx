import { createFileRoute } from "@tanstack/react-router";
import { CompassScreen } from "@/components/compass/compass-screen.tsx";

export const Route = createFileRoute("/compass/goal/$id")({
  component: GoalRoute,
});

function GoalRoute() {
  const { id } = Route.useParams();
  return <CompassScreen view={{ page: "goal", goalId: id }} />;
}
