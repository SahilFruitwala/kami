import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useYear } from "@/hooks/use-compass.ts";
import { quarterId, quarterRange, type QuarterKey } from "@/lib/compass/dates";
import { buildYear, type YearGoal, type YearModel } from "@/lib/compass/year";
import { cn } from "@/lib/utils.ts";
import { colorClass, pct, shade } from "./compass-ui.tsx";

const qlabel = (q: QuarterKey) => `Q${q.quarter}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The year in two calm parts: a quarter timeline, then each habit month by month. */
export function YearPage({ year }: { year: number }) {
  const { data, isLoading, error } = useYear(year);
  const model = useMemo(() => (data ? buildYear(data) : null), [data]);
  const thisYear = data ? Number(data.today.slice(0, 4)) : year;

  return (
    <>
      <div className="cp-ph cp-enter">
        <span className="cp-crumb">
          <Link to="/compass">This quarter</Link> / Year
        </span>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2>{year}</h2>
          <span className="cp-qswitch" aria-label="Year">
            <Link to="/compass/year" search={{ y: year - 1 }} aria-label={`${year - 1}`}>
              ‹
            </Link>
            {year < thisYear ? (
              <Link to="/compass/year" search={{ y: year + 1 }} aria-label={`${year + 1}`}>
                ›
              </Link>
            ) : (
              <span aria-disabled="true">›</span>
            )}
          </span>
        </div>
      </div>

      {isLoading ? <p className="cp-note">Loading…</p> : null}
      {error ? <p className="cp-note">The year couldn't load. Refresh to try again.</p> : null}
      {model ? (
        <>
          <section className="cp-sect cp-enter" style={{ animationDelay: "40ms" }}>
            <h3>Quarters</h3>
            <ol className="cp-card cp-ytimeline">
              {model.quarters.map((q) => (
                <QuarterRow key={q.quarter.quarter} q={q} />
              ))}
            </ol>
          </section>
          <HabitMonths model={model} />
        </>
      ) : null}
    </>
  );
}

function QuarterRow({ q }: { q: YearModel["quarters"][number] }) {
  const done = q.goals.filter((g) => g.goal.outcome === "done").length;
  const summary =
    q.mode === "future"
      ? "Not planned yet"
      : !q.goals.length
        ? "No goals"
        : q.mode === "current"
          ? `${q.goals.length} ${q.goals.length === 1 ? "goal" : "goals"} in progress`
          : `${done} of ${q.goals.length} done`;
  const head = (
    <span className="cp-yq-head">
      <b>{qlabel(q.quarter)}</b>
      <span>{quarterRange(q.quarter)}</span>
      {q.mode === "current" ? <em>Now</em> : null}
    </span>
  );
  const goals = q.goals.length ? (
    <ul className="cp-yq-goals">
      {q.goals.map((g) => (
        <GoalChip key={g.goal.id} g={g} current={q.mode === "current"} />
      ))}
    </ul>
  ) : (
    <span className="cp-note">{summary}</span>
  );
  const body = (
    <>
      {head}
      <span className="cp-yq-body">
        {q.goals.length ? <span className="cp-note">{summary}</span> : null}
        {goals}
      </span>
    </>
  );

  const cls = cn("cp-yq", q.mode === "current" && "is-current", q.mode === "future" && "is-future");
  if (q.mode === "current") {
    return (
      <li>
        <Link to="/compass" className={cls}>
          {body}
        </Link>
      </li>
    );
  }
  if (q.mode === "past" && q.goals.length) {
    return (
      <li>
        <Link to="/compass/q/$quarter" params={{ quarter: quarterId(q.quarter) }} className={cls}>
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <div className={cls}>{body}</div>
    </li>
  );
}

function GoalChip({ g, current }: { g: YearGoal; current: boolean }) {
  const { goal } = g;
  const mark =
    goal.outcome === "done"
      ? "✓"
      : goal.outcome === "dropped"
        ? "✕"
        : goal.outcome === "carried"
          ? `→ ${g.to ? qlabel(g.to) : ""}`
          : current
            ? pct(g.progress)
            : "";
  return (
    <li
      className={cn("cp-ychip", colorClass(goal.color), goal.outcome === "dropped" && "is-dropped")}
      title={g.from ? `${goal.name}, carried over from ${qlabel(g.from)}` : goal.name}
    >
      <span className="cp-swatch" />
      <span className="cp-ychip-name">{goal.name}</span>
      {mark ? <span className="cp-ychip-mark cp-num">{mark}</span> : null}
    </li>
  );
}

function HabitMonths({ model }: { model: YearModel }) {
  const [showArchived, setShowArchived] = useState(false);
  const live = model.rows.filter((r) => !r.archived);
  const archived = model.rows.filter((r) => r.archived);
  const rows = showArchived ? [...live, ...archived] : live;
  if (!model.rows.length) return null;

  return (
    <section className="cp-sect cp-enter" style={{ animationDelay: "80ms" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3>Habits by month</h3>
        {archived.length ? (
          <button
            type="button"
            className="cp-link"
            style={{ fontSize: 13 }}
            onClick={() => setShowArchived((v) => !v)}
            aria-expanded={showArchived}
          >
            {showArchived ? "Hide archived" : `Show ${archived.length} archived`}
          </button>
        ) : null}
      </div>
      <div className="cp-card cp-ymonths" role="table" aria-label="Habits, month by month">
        <div className="cp-ym-row cp-ym-head" role="row">
          <span role="columnheader" />
          {MONTHS.map((m, i) => (
            <span
              key={m}
              role="columnheader"
              className={i === model.currentMonth ? "is-now" : undefined}
            >
              <span className="cp-ym-long">{m}</span>
              <span className="cp-ym-short" aria-hidden="true">
                {m[0]}
              </span>
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.id} className={cn("cp-ym-row", colorClass(row.color))} role="row">
            <span role="rowheader" className={cn("cp-ym-name", row.archived && "is-archived")}>
              <span className="cp-swatch" />
              <span>{row.name}</span>
            </span>
            {row.months.map((r, i) => (
              <i
                key={i}
                role="cell"
                className={cn(r === null && "is-empty", i === model.currentMonth && "is-now")}
                style={r !== null ? { background: shade(r) } : undefined}
                title={`${row.name}, ${MONTHS[i]}: ${r === null ? "no data" : `${pct(r)} of weekly targets`}`}
              />
            ))}
          </div>
        ))}
      </div>
      <span className="cp-note">Darker means more of the weekly target was hit that month.</span>
    </section>
  );
}
