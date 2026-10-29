import { useEffect, useRef, useState } from "react";
import { Check, Circle, LoaderCircle, Square } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import type { PlanQuery, RunProgress as Progress } from "@/lib/research/kinds.ts";
import {
  QUIET_NOTICE_MS,
  describeRunActivity,
  formatElapsed,
} from "@/lib/research/run-activity.ts";
import { cn } from "@/lib/utils.ts";

/**
 * A run's live progress, shared by the product run page and the debug page:
 * what it is doing right now, how long it has been going, the steps with
 * their counters, and a notice when nothing has changed for a while (a slow
 * model call or page is normal, but silence should never look like a hang).
 */

/** The part of a run both views have. */
export type ProgressRun = {
  kind: string;
  state: string;
  step: string | null;
  plan: PlanQuery[];
  progress: Progress;
  input: { link?: string };
  tokensIn: number;
  tokensOut: number;
  firecrawlCredits: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

const ACTIVE = new Set(["queued", "running"]);

type StepRow = { key: string; label: string; detail: string };

function steps(run: ProgressRun, ideasCount: number, reportDone: boolean): StepRow[] {
  const p = run.progress;
  const n = (v: number | undefined) => v ?? 0;
  const rows: StepRow[] = [];
  if (!run.input.link) {
    rows.push(
      {
        key: "search",
        label: "Search",
        detail: `${n(p.searched)} of ${n(p.queries)} searches${p.reusedSearches ? `, ${p.reusedSearches} reused` : ""} · ${n(p.results)} results`,
      },
      {
        key: "triage",
        label: "Pick pages",
        detail: `${(p.toRead ?? []).length} picked of ${n(p.candidates)}`,
      },
    );
  }
  rows.push(
    {
      key: "fetch",
      label: "Read pages",
      detail: `${n(p.read)} read${p.failed ? `, ${p.failed} couldn't be read` : ""}`,
    },
    {
      key: "extract",
      label: "Pull quotes",
      detail: `${n(p.quotes)} checked quotes${p.dropped ? `, ${p.dropped} dropped` : ""}`,
    },
  );
  if (run.kind === "explore") {
    rows.push(
      { key: "players", label: "Note products", detail: `${n(p.playersNew)} new` },
      {
        key: "fill",
        label: "Read their sites",
        detail: p.playersTotal ? `${n(p.playersFilled)} of ${p.playersTotal}` : "",
      },
    );
    return rows;
  }
  if (run.kind !== "discover") {
    rows.push({ key: "report", label: "Write the report", detail: reportDone ? "done" : "" });
    return rows;
  }
  rows.push(
    { key: "players", label: "Note products", detail: `${n(p.playersNew)} new` },
    { key: "match", label: "Group into ideas", detail: `${ideasCount} ideas so far` },
    { key: "name", label: "Name ideas", detail: p.named ? "done" : "" },
    {
      key: "score",
      label: "Score",
      detail:
        p.ideasTouched !== undefined ? `${n(p.ideasNew)} new, ${n(p.ideasTouched)} updated` : "",
    },
  );
  return rows;
}

/** The current time, refreshed every second while `on`. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

/** When `signature` last changed, as seen by this view (its first sight counts). */
function useLastChange(signature: string): number {
  const seen = useRef({ signature, at: Date.now() });
  if (seen.current.signature !== signature) seen.current = { signature, at: Date.now() };
  return seen.current.at;
}

export function RunProgressPanel({
  run,
  ideasCount = 0,
  reportDone = false,
  onStop,
  stopDisabled,
}: {
  run: ProgressRun;
  ideasCount?: number;
  reportDone?: boolean;
  /** Shows a Stop button while the run is working. */
  onStop?: () => void;
  stopDisabled?: boolean;
}) {
  const active = ACTIVE.has(run.state);
  const now = useNow(active);
  const lastChange = useLastChange(
    JSON.stringify([
      run.state,
      run.step,
      run.progress,
      run.tokensIn,
      run.tokensOut,
      run.firecrawlCredits,
    ]),
  );
  const rows = steps(run, ideasCount, reportDone);
  const current = rows.findIndex((r) => r.key === run.step);
  const stopRequested = Boolean(run.progress.stopRequested);
  const activity = describeRunActivity(run);
  const quietFor = now - lastChange;
  const began = run.startedAt ?? run.createdAt;
  const took = run.finishedAt && run.startedAt ? run.finishedAt - run.startedAt : null;

  return (
    <section aria-label="Progress" className="kami-sheet flex flex-col gap-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl text-ink">Progress</h2>
        <div className="flex items-center gap-3">
          {active ? (
            <span className="font-sans text-xs text-ink-muted tabular-nums">
              {formatElapsed(now - began)} elapsed
            </span>
          ) : took !== null ? (
            <span className="font-sans text-xs text-ink-muted tabular-nums">
              took {formatElapsed(took)}
            </span>
          ) : null}
          {active && onStop ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onStop}
              disabled={stopDisabled || stopRequested}
            >
              <Square className="size-3.5" aria-hidden="true" />
              {stopRequested ? "Stopping…" : "Stop"}
            </Button>
          ) : null}
        </div>
      </div>

      {activity ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-xl bg-hanko/5 px-3 py-2.5"
        >
          <LoaderCircle
            className="mt-0.5 size-4 shrink-0 animate-spin text-hanko"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="font-sans text-sm font-medium text-ink">{activity.headline}</p>
            {activity.detail ? (
              <p className="font-body text-xs break-words text-ink-soft">{activity.detail}</p>
            ) : null}
            {quietFor >= QUIET_NOTICE_MS ? (
              <p className="mt-1 font-body text-xs text-ink-muted">
                Nothing new for {formatElapsed(quietFor)}. A slow model call or page can take a
                minute; if the server dropped the run it restarts itself.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <ol className="flex flex-col gap-2">
        {rows.map((row, i) => {
          const done = !active || (current >= 0 && i < current) || run.step === "end";
          const working = active && i === current;
          return (
            <li key={row.key} className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0" aria-hidden="true">
                {working ? (
                  <LoaderCircle className="size-4 animate-spin text-hanko" />
                ) : done ? (
                  <Check className="size-4 text-ink-soft" />
                ) : (
                  <Circle className="size-4 text-line" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                <span
                  className={cn(
                    "font-sans text-sm",
                    working ? "font-medium text-ink" : "text-ink-soft",
                  )}
                >
                  {row.label}
                </span>
                <span className="font-sans text-xs text-ink-muted tabular-nums">{row.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
