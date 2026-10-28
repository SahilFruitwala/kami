import type { ReactNode } from "react";
import type { IdeaCard as Idea } from "@/lib/api/research.ts";
import { cn } from "@/lib/utils.ts";
import { COMPETITION_LABEL, SUB_SCORES } from "./research-format.ts";

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2" title={`${label}: ${pct} of 100`}>
      <span className="w-[4.5rem] shrink-0 font-sans text-[11px] text-ink-muted">{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-warm" aria-hidden="true">
        <span className="block h-full rounded-full bg-persimmon" style={{ width: `${pct}%` }} />
      </span>
      <span className="sr-only">{`${pct} of 100`}</span>
    </div>
  );
}

/**
 * One idea: title, summary, the five sub-scores as small bars, the
 * competition label, the evidence count and the "New" / "+N" badges from the
 * topic's latest run. `actions` and `selector` are the Ideas tab's controls.
 */
export function IdeaCard({
  idea,
  onOpen,
  actions,
  selector,
}: {
  idea: Idea;
  onOpen?: () => void;
  actions?: ReactNode;
  selector?: ReactNode;
}) {
  const score = idea.score;
  return (
    <article
      className={cn(
        "kami-sheet flex h-full flex-col gap-3 p-4",
        idea.status === "starred" && "ring-1 ring-hanko/40",
        idea.status === "dismissed" && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        {selector}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {idea.isNew ? <Badge tone="new">New</Badge> : null}
            {!idea.isNew && idea.addedLastRun > 0 ? <Badge>+{idea.addedLastRun}</Badge> : null}
            {idea.status === "starred" ? <Badge>Starred</Badge> : null}
            {idea.status === "dismissed" ? <Badge>Dismissed</Badge> : null}
          </div>
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="mt-1 text-left font-display text-lg leading-tight text-ink hover:text-hanko focus-visible:ring-2 focus-visible:ring-hanko/40 focus-visible:outline-none"
            >
              {idea.title}
            </button>
          ) : (
            <h3 className="mt-1 font-display text-lg leading-tight text-ink">{idea.title}</h3>
          )}
          {idea.summary ? (
            <p className="mt-1 font-body text-sm leading-relaxed text-ink-soft">{idea.summary}</p>
          ) : null}
        </div>
        {score ? (
          <span
            className="shrink-0 font-display text-xl text-ink tabular-nums"
            title="Overall score, out of 100"
          >
            {Math.round(score.total * 100)}
          </span>
        ) : null}
      </div>
      {score ? (
        <div className="grid gap-1">
          {SUB_SCORES.map((s) => (
            <ScoreBar key={s.key} label={s.label} value={score[s.key]} />
          ))}
        </div>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[11px] text-ink-muted">
        <span>
          {idea.evidenceCount} {idea.evidenceCount === 1 ? "quote" : "quotes"}
        </span>
        {score ? <span>{COMPETITION_LABEL[score.competition]}</span> : null}
        {actions ? <span className="ml-auto flex items-center gap-1">{actions}</span> : null}
      </div>
    </article>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone?: "new" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-sans text-[10px] font-semibold tracking-wide uppercase",
        tone === "new" ? "bg-hanko text-white" : "bg-paper-warm text-ink-soft",
      )}
    >
      {children}
    </span>
  );
}
