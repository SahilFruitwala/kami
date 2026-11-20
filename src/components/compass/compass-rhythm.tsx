import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useCloseQuarter, useQuarter, useSaveReview } from "@/hooks/use-compass.ts";
import type {
  CompassGoal,
  CompassRhythm,
  GoalOutcome,
  QuarterGoal,
  ReviewAnswers,
} from "@/lib/api/compass";
import { quarterId, quarterRange, shortDay, type QuarterKey } from "@/lib/compass/dates";
import { goalProgress } from "@/lib/compass/engine";
import { cn } from "@/lib/utils.ts";
import { Sheet, type SheetState } from "./compass-sheets.tsx";
import { colorClass, pct } from "./compass-ui.tsx";

const label = (q: QuarterKey) => `Q${q.quarter} ${q.year}`;

const OUTCOME_LABEL: Record<GoalOutcome, string> = {
  done: "✓ Done",
  carried: "→ Carried over",
  dropped: "✕ Dropped",
};

// ---------- Banners on the overview ----------

export function RhythmBanners({ rhythm, onRetro }: { rhythm: CompassRhythm; onRetro: () => void }) {
  const { retro, planningOpen, next } = rhythm;
  if (!retro && !planningOpen) return null;
  return (
    <div className="grid gap-3 cp-enter">
      {retro ? (
        <div className="cp-card cp-banner">
          <span>
            <b>Close {label(retro.quarter)}</b>
            <small>
              {retro.goals.length} {retro.goals.length === 1 ? "goal needs" : "goals need"} a
              decision. Unsorted goals are dropped after {shortDay(retro.deadline)}.
            </small>
          </span>
          <button type="button" className="cp-btn cp-btn--primary cp-btn--sm" onClick={onRetro}>
            Start retro
          </button>
        </div>
      ) : null}
      {planningOpen ? (
        <Link
          to="/compass/q/$quarter"
          params={{ quarter: quarterId(next.quarter) }}
          className="cp-card cp-banner"
        >
          <span>
            <b>Plan {label(next.quarter)}</b>
            <small>
              {next.goalCount
                ? `${next.goalCount} ${next.goalCount === 1 ? "goal" : "goals"} drafted. They start on day one of the quarter.`
                : "Planning is open. Draft the goals for next quarter."}
            </small>
          </span>
          <span className="cp-link">
            Open <span aria-hidden="true">→</span>
          </span>
        </Link>
      ) : null}
    </div>
  );
}

// ---------- Weekly review ----------

const QUESTIONS: [keyof ReviewAnswers, string, string][] = [
  ["moved", "What moved a goal forward?", "Finished the VPC lab, ran twice"],
  ["blocked", "What got in the way?", "Late meetings ate study time"],
  ["change", "One change for next week", "Study before work, not after"],
];

/** Open Friday → Tuesday. Saves a moment after you stop typing, and on leaving a field. */
export function ReviewCard({ rhythm }: { rhythm: CompassRhythm }) {
  const week = rhythm.reviewWeek;
  const save = useSaveReview();
  const [answers, setAnswers] = useState<ReviewAnswers>(
    rhythm.review ?? { moved: "", blocked: "", change: "" },
  );
  const [saved, setSaved] = useState(!!rhythm.review);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(answers);
  latest.current = answers;

  const flush = () => {
    clearTimeout(timer.current);
    if (!week) return;
    save.mutate({ weekStart: week, answers: latest.current }, { onSuccess: () => setSaved(true) });
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  if (!week) return null;
  return (
    <section className="cp-sect cp-enter" aria-labelledby="cp-review-title">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="cp-review-title">Weekly review</h3>
        <span className="cp-note" role="status">
          Week of {shortDay(week)} ·{" "}
          {save.isPending ? "Saving…" : saved ? "Saved" : "Not saved yet"}
        </span>
      </div>
      <div className="cp-card cp-review">
        {QUESTIONS.map(([key, q, hint]) => (
          <label key={key} className="cp-field">
            <span>{q}</span>
            <textarea
              id={`cp-review-${key}`}
              className="cp-input"
              rows={2}
              maxLength={1000}
              placeholder={hint}
              value={answers[key]}
              onChange={(e) => {
                setAnswers((a) => ({ ...a, [key]: e.target.value }));
                setSaved(false);
                clearTimeout(timer.current);
                timer.current = setTimeout(flush, 900);
              }}
              onBlur={() => !saved && flush()}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

// ---------- Quarter retro ----------

type Exit = "up" | "right" | "fade";
const EXIT_FOR: Record<GoalOutcome, Exit> = { done: "up", carried: "right", dropped: "fade" };

/**
 * One goal at a time: Done, Carry over or Drop. The card leaves in the
 * direction of the choice, then a last step asks what the quarter taught you.
 */
export function RetroPanel({
  rhythm,
  open,
  onClose,
}: {
  rhythm: CompassRhythm;
  open: boolean;
  onClose: () => void;
}) {
  const retro = rhythm.retro;
  return (
    <Sheet
      open={open && !!retro}
      onClose={onClose}
      title={retro ? `Close ${label(retro.quarter)}` : "Retro"}
    >
      {retro ? (
        <RetroSteps
          key={quarterId(retro.quarter)}
          quarter={retro.quarter}
          goals={retro.goals}
          onDone={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function RetroSteps({
  quarter,
  goals,
  onDone,
}: {
  quarter: QuarterKey;
  goals: CompassGoal[];
  onDone: () => void;
}) {
  const close = useCloseQuarter();
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<{ goalId: string; outcome: GoalOutcome }[]>([]);
  const [exit, setExit] = useState<Exit | null>(null);
  const [note, setNote] = useState("");
  const goal = goals[index];
  const reduce =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const choose = (outcome: GoalOutcome) => {
    if (!goal || exit) return;
    setDecisions((d) => [...d, { goalId: goal.id, outcome }]);
    setExit(EXIT_FOR[outcome]);
    window.setTimeout(
      () => {
        setExit(null);
        setIndex((i) => i + 1);
      },
      reduce ? 0 : 200,
    );
  };

  async function finish() {
    try {
      await close.mutateAsync({
        quarter: quarterId(quarter),
        decisions,
        note: note.trim() || null,
      });
      onDone();
    } catch {
      /* toast shown */
    }
  }

  if (goal) {
    const progress = goalProgress(goal.milestones.map((m) => ({ weight: m.weight, done: m.done })));
    const done = goal.milestones.filter((m) => m.done).length;
    return (
      <>
        <p className="cp-note cp-num">
          Goal {index + 1} of {goals.length}
        </p>
        <div
          className={cn(
            "cp-card cp-retro-card",
            colorClass(goal.color),
            exit && `is-leaving-${exit}`,
          )}
          key={goal.id}
        >
          <span className="cp-goalname">
            <span className="cp-swatch" style={{ width: 10, height: 10 }} />
            <span>{goal.name}</span>
          </span>
          {goal.why ? <p className="cp-note">{goal.why}</p> : null}
          <p>
            {goal.milestones.length
              ? `${done} of ${goal.milestones.length} milestones done · ${pct(progress)}`
              : "No milestones"}
          </p>
          <ul className="cp-retro-ms">
            {goal.milestones.map((m) => (
              <li key={m.id} className={m.done ? "is-done" : undefined}>
                {m.title}
              </li>
            ))}
          </ul>
        </div>
        <div className="cp-retro-actions">
          <button type="button" className="cp-btn" onClick={() => choose("done")}>
            ✓ Done
          </button>
          <button type="button" className="cp-btn" onClick={() => choose("carried")}>
            → Carry over
          </button>
          <button type="button" className="cp-btn cp-btn--danger" onClick={() => choose("dropped")}>
            ✕ Drop
          </button>
        </div>
        <p className="cp-hint">
          Carry over moves the goal, its unfinished milestones and its habits into this quarter.
          Done keeps its habits as ongoing. Drop archives its habits.
        </p>
      </>
    );
  }

  return (
    <>
      <ul className="cp-retro-summary">
        {decisions.map((d) => {
          const g = goals.find((x) => x.id === d.goalId)!;
          return (
            <li key={d.goalId} className={colorClass(g.color)}>
              <span className="cp-swatch" />
              {g.name}
              <span className="cp-note">{OUTCOME_LABEL[d.outcome]}</span>
            </li>
          );
        })}
      </ul>
      <label className="cp-field">
        <span>What did this quarter teach you?</span>
        <textarea
          id="cp-retro-note"
          className="cp-input"
          rows={4}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Fewer goals went further. Mornings work, evenings don't."
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="cp-btn"
          onClick={() => {
            setIndex(0);
            setDecisions([]);
          }}
        >
          Start over
        </button>
        <button
          type="button"
          className="cp-btn cp-btn--primary"
          disabled={close.isPending}
          onClick={() => void finish()}
        >
          Close {label(quarter)}
        </button>
      </div>
    </>
  );
}

// ---------- A past quarter, or the next one while planning ----------

export function QuarterPage({ id, onSheet }: { id: string; onSheet: (s: SheetState) => void }) {
  const { data, isLoading, error } = useQuarter(id);
  const navigate = useNavigate();

  useEffect(() => {
    if (data?.mode === "current") void navigate({ to: "/compass", replace: true });
  }, [data?.mode, navigate]);

  if (isLoading) return <p className="cp-note">Loading…</p>;
  if (error || !data) {
    return (
      <div className="cp-card cp-empty">
        <h3>That quarter isn't open</h3>
        <p>
          You can look back at past quarters, and plan the next one in the last two weeks of this
          one.
        </p>
        <Link to="/compass" className="cp-link">
          Back to this quarter <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }

  const planning = data.mode === "planning";
  return (
    <>
      <div className="cp-ph cp-enter">
        <span className="cp-crumb">
          <Link to="/compass">This quarter</Link> / {planning ? "Planning" : "Past quarter"}
        </span>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2>
            {planning ? "Plan " : ""}
            {label(data.quarter)}
          </h2>
          {planning ? (
            <button
              type="button"
              className="cp-btn cp-btn--primary cp-btn--sm"
              onClick={() => onSheet({ kind: "goal", next: true })}
            >
              New goal
            </button>
          ) : null}
        </div>
        <p>
          {quarterRange(data.quarter)}.{" "}
          {planning
            ? "Draft goals and milestones now; they go live on the first day. Habits are added once it starts."
            : "Read-only. This is how the quarter ended."}
        </p>
      </div>

      {data.goals.length ? (
        <div className="cp-card cp-enter" style={{ animationDelay: "40ms" }}>
          {data.goals.map((g) => (
            <QuarterGoalRow
              key={g.id}
              goal={g}
              planning={planning}
              onEdit={() => onSheet({ kind: "goal", goal: g })}
            />
          ))}
        </div>
      ) : (
        <div className="cp-card cp-empty cp-enter">
          <h3>{planning ? "No goals drafted yet" : "No goals that quarter"}</h3>
          <p>
            {planning
              ? "One to three goals tends to work best. Add a few dated milestones to each."
              : "Nothing was planned for this quarter."}
          </p>
        </div>
      )}

      {data.retro ? (
        <section className="cp-sect cp-enter">
          <h3>What it taught you</h3>
          <p
            className="cp-card"
            style={{ padding: "16px 18px", margin: 0, whiteSpace: "pre-wrap" }}
          >
            {data.retro}
          </p>
        </section>
      ) : null}
    </>
  );
}

function QuarterGoalRow({
  goal,
  planning,
  onEdit,
}: {
  goal: QuarterGoal;
  planning: boolean;
  onEdit: () => void;
}) {
  const done = goal.milestones.filter((m) => m.done).length;
  return (
    <div className={cn("cp-goalrow", colorClass(goal.color))}>
      <span className="cp-goalname">
        <span className="cp-swatch" style={{ width: 10, height: 10 }} />
        <span>{goal.name}</span>
      </span>
      {planning ? (
        <button type="button" className="cp-btn cp-btn--sm" onClick={onEdit}>
          Edit
        </button>
      ) : (
        <span
          className={cn(
            "cp-status",
            goal.outcome === "done" ? "cp-status--ok" : "cp-status--plain",
          )}
        >
          {goal.outcome ? OUTCOME_LABEL[goal.outcome] : "Not sorted yet"}
        </span>
      )}
      <span className="cp-meta">
        <span>
          {goal.milestones.length
            ? planning
              ? `${goal.milestones.length} milestones`
              : `${done} of ${goal.milestones.length} milestones done`
            : "No milestones"}
        </span>
        {goal.carriedFromGoalId ? <span>Carried over from last quarter</span> : null}
        {goal.why ? <span>{goal.why}</span> : null}
      </span>
    </div>
  );
}
