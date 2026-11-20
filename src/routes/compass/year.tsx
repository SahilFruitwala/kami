import { createFileRoute } from "@tanstack/react-router";
import { CompassScreen } from "@/components/compass/compass-screen.tsx";

type YearSearch = { y?: number };

export const Route = createFileRoute("/compass/year")({
  validateSearch: (search: Record<string, unknown>): YearSearch => {
    const y = Number(search.y);
    return Number.isInteger(y) && y >= 2000 && y <= 2100 ? { y } : {};
  },
  component: YearRoute,
});

function YearRoute() {
  const { y } = Route.useSearch();
  return <CompassScreen view={{ page: "year", year: y ?? new Date().getFullYear() }} />;
}
