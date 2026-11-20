import { Link } from "@tanstack/react-router";
import { useMemo, type CSSProperties } from "react";
import { useYear } from "@/hooks/use-compass.ts";
import { addDays, quarterId, type QuarterKey } from "@/lib/compass/dates";
import { buildYear, type YearGoal, type YearModel } from "@/lib/compass/year";
import { cn } from "@/lib/utils.ts";
import { colorClass, pct, shade } from "./compass-ui.tsx";

const qlabel = (q: QuarterKey) => `Q${q.quarter}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Four quarters side by side and every habit's year, one square per week. */
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
          <h2>{year} at a glance</h2>
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
        <p>
          Finished quarters keep how each goal ended. Arrows follow a goal from one quarter into the
          next.
        </p>
      </div>

      {isLoading ? <p className="cp-note">Loading…</p> : null}
      {error ? <p className="cp-note">The year couldn't load. Refresh to try again.</p> : null}
      {model ? (
        <>
          <div className="cp-year-quarters cp-enter" style={{ animationDelay: "40ms" }}>
            {model.quarters.map((q) => (
              <QuarterCard key={q.quarter.quarter} q={q} />
            ))}
          </div>
          <HabitYear model={model} />
        </>
      ) : null}
    </>
  );
}

function QuarterCard({ q }: { q: YearModel["quarters"][number] }) {
  const body = (
    <>
      <h3>
        {qlabel(q.quarter)}
        <span className={cn("cp-note", q.mode === "current" && "cp-now")}>
          {q.mode === "current" ? "Now" : q.mode === "past" ? "Closed" : "Ahead"}
        </span>
      </h3>
      {q.goals.length ? (
        <ul>
          {q.goals.map((g) => (
            <GoalLine key={g.goal.id} g={g} current={q.mode === "current"} />
          ))}
        </ul>
      ) : (
        <p className="cp-yempty">{q.mode === "future" ? "Not planned yet" : "No goals"}</p>
      )}
    </>
  );
  if (q.mode === "current") {
    return (
      <Link to="/compass" className="cp-card cp-qcard is-current">
        {body}
      </Link>
    );
  }
  if (q.mode === "past") {
    return (
      <Link
        to="/compass/q/$quarter"
        params={{ quarter: quarterId(q.quarter) }}
        className="cp-card cp-qcard"
      >
        {body}
      </Link>
    );
  }
  return <div className="cp-card cp-qcard is-future">{body}</div>;
}

function GoalLine({ g, current }: { g: YearGoal; current: boolean }) {
  const { goal } = g;
  const result =
    goal.outcome === "done"
      ? "✓ done"
      : goal.outcome === "dropped"
        ? "✕ dropped"
        : goal.outcome === "carried"
          ? `→ ${g.to ? qlabel(g.to) : "next"}`
          : current
            ? pct(g.progress)
            : "unsorted";
  return (
    <li className={colorClass(goal.color)}>
      <span className="cp-swatch" />
      <span className="cp-yname">
        {goal.name}
        {g.from ? <small>↳ from {qlabel(g.from)}</small> : null}
      </span>
      <span className={cn("cp-yres cp-num", goal.outcome === "done" && "is-done")}>{result}</span>
    </li>
  );
}

function HabitYear({ model }: { model: YearModel }) {
  if (!model.rows.length) return null;
  const n = model.weeks.length;
  const style = { "--n": n } as CSSProperties;
  // Label a week by the month it ends in, so the first column reads "Jan", not last December.
  const monthOf = (i: number) => addDays(model.weeks[i]!, 6).slice(5, 7);
  const monthAt = (i: number) =>
    i === 0 || monthOf(i - 1) !== monthOf(i) ? MONTHS[Number(monthOf(i)) - 1] : "";
  return (
    <section className="cp-sect cp-enter" style={{ animationDelay: "80ms" }}>
      <h3>Habits across the year</h3>
      <div className="cp-card cp-yscroll">
        <div className="cp-ygrid" style={style} role="table" aria-label="Habits, week by week">
          <span className="cp-ylabel" />
          {model.weeks.map((w, i) => (
            <span
              key={w}
              className={cn("cp-ymonth", model.quarterStarts.includes(i) && "is-qstart")}
            >
              {monthAt(i)}
            </span>
          ))}
          {model.rows.map((row) => (
            <Row key={row.id} row={row} model={model} />
          ))}
        </div>
      </div>
      <span className="cp-note">
        One square per week, shaded by how much of the weekly target was hit.
      </span>
    </section>
  );
}

function Row({ row, model }: { row: YearModel["rows"][number]; model: YearModel }) {
  return (
    <>
      <span
        className={cn("cp-ylabel", row.archived && "is-archived")}
        role="rowheader"
        title={row.name}
      >
        {row.name}
      </span>
      {row.weeks.map((r, i) => (
        <i
          key={i}
          className={cn(
            colorClass(row.color),
            model.quarterStarts.includes(i) && "is-qstart",
            i === model.currentWeek && "is-now",
            r === null && "is-empty",
          )}
          style={r !== null ? { background: shade(r) } : undefined}
          title={`${row.name}, week of ${model.weeks[i]}: ${r === null ? "—" : pct(r)}`}
        />
      ))}
    </>
  );
}
