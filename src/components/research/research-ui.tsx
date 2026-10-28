import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils.ts";
import { runStateLabel } from "./research-format.ts";

/** Shared bits of the Research pages. */

export function StatePill({
  state,
  stopReason,
  started,
}: {
  state: string;
  stopReason?: string | null;
  started?: boolean;
}) {
  const tone =
    state === "failed"
      ? "bg-destructive/10 text-destructive"
      : state === "done"
        ? "bg-paper-warm text-ink"
        : state === "stopped"
          ? "bg-paper-warm text-ink-soft"
          : "bg-hanko/10 text-hanko";
  return (
    <span
      className={cn("inline-flex rounded-full px-2 py-0.5 font-sans text-[11px] font-medium", tone)}
    >
      {runStateLabel(state, stopReason, started)}
    </span>
  );
}

/** A plain notice for when Research isn't set up on this server. */
export function ResearchUnavailable() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pt-14 pb-10 sm:px-8">
      <div className="kami-sheet p-6">
        <h1 className="font-display text-2xl text-ink">Page not found</h1>
        <p className="mt-2 font-body text-sm text-ink-soft">
          <Link to="/app" className="text-hanko underline-offset-4 hover:underline">
            Back to Kami
          </Link>
        </p>
      </div>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="kami-sheet p-6 font-body text-sm leading-relaxed text-ink-soft">{children}</p>
  );
}
