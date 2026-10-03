import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing-page.tsx";

export const Route = createFileRoute("/")({
  ssr: true,
  component: LandingPage,
});
