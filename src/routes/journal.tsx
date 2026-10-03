import { createFileRoute, Navigate } from "@tanstack/react-router";

// Journal is paused for now: the `journalEntries` table stays in the DB, but
// nothing reads from or writes to it (no server functions are called).
// This route redirects home so old links/deep-links keep working.
export const Route = createFileRoute("/journal")({
  component: () => <Navigate to="/app" replace />,
});
