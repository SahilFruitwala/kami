import { createFileRoute, redirect } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing-page.tsx";

export const Route = createFileRoute("/")({
  ssr: true,
  // Bookmarklets created before the /capture handoff opened `/?import=…`.
  beforeLoad: ({ location }) => {
    const legacy = new URLSearchParams(location.searchStr).get("import");
    if (legacy) throw redirect({ to: "/capture", search: { import: legacy }, replace: true });
  },
  component: LandingPage,
});
