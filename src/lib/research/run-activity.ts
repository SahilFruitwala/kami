import type { PlanQuery, RunProgress } from "./kinds.ts";

/**
 * What a running Research run is doing right now, in words, from the step it
 * is on and the counters that step has saved. Pure, so the run views (product
 * and debug) say the same thing. Tested in tests/research-run-activity.test.mjs.
 */

export type ActivityRun = {
  state: string;
  step: string | null;
  plan: PlanQuery[];
  progress: RunProgress;
};

export type RunActivity = { headline: string; detail: string | null };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The activity of a run that has not finished; null once it has (or before it has a plan). */
export function describeRunActivity(run: ActivityRun): RunActivity | null {
  const p = run.progress;
  const n = (v: number | undefined) => v ?? 0;
  if (run.state === "drafting") {
    return { headline: "Drafting the search plan", detail: "Asking the model for searches." };
  }
  if (run.state === "queued") {
    return { headline: "Starting", detail: "Waiting for the run to be picked up." };
  }
  if (run.state !== "running") return null;

  if (p.stopRequested) {
    return {
      headline: "Stopping",
      detail: "Finishing the current step, then scoring what it has found.",
    };
  }

  switch (run.step) {
    case "search": {
      const checked = run.plan.filter((q) => q.checked !== false);
      const total = n(p.queries) || checked.length;
      const at = n(p.searched);
      const next = checked[at];
      return {
        headline: `Searching the web · ${Math.min(at + 1, total)} of ${total}`,
        detail: next ? `“${next.query}”` : null,
      };
    }
    case "triage":
      return {
        headline: "Choosing which results are worth reading",
        detail: `${plural(n(p.candidates), "result")} to look through · ${n(p.picks?.length)} picked so far`,
      };
    case "fetch": {
      const total = p.toRead?.length ?? 0;
      return {
        headline: total ? `Reading pages · ${n(p.read)} of ${total}` : "Reading pages",
        detail: p.failed ? `${plural(p.failed, "page")} skipped (couldn't be read)` : null,
      };
    }
    case "extract":
      return {
        headline: "Pulling quotes from the pages",
        detail: `${plural(n(p.quotes), "checked quote")} kept so far${p.dropped ? `, ${p.dropped} dropped` : ""}`,
      };
    case "players":
      return { headline: "Noting the products people mention", detail: null };
    case "match":
      return {
        headline: "Grouping quotes into ideas",
        detail: p.matchBatches ? `${plural(p.matchBatches, "batch", "batches")} done` : null,
      };
    case "name":
      return { headline: "Naming the new ideas", detail: null };
    case "score":
      return { headline: "Scoring the ideas", detail: null };
    case "report":
      return { headline: "Writing the report", detail: null };
    case "fill":
      return {
        headline: p.playersTotal
          ? `Looking up product sites · ${n(p.playersFilled)} of ${p.playersTotal}`
          : "Looking up product sites",
        detail: null,
      };
    default:
      return { headline: "Wrapping up", detail: null };
  }
}

/** "8s", "1m 05s", "1h 02m". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m ${String(total % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** How long a run may show no change before the view says so. */
export const QUIET_NOTICE_MS = 45_000;
