import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing-page.tsx";

export const Route = createFileRoute("/")({
  component: LandingPage,
});
