import type { CSSProperties } from "react";
import type { CompassHabit } from "@/lib/api/compass";
import type { GoalColor } from "@/lib/api/schemas/compass";
import type { ScheduleRule } from "@/lib/compass/engine";
import type { HabitView } from "@/lib/compass/model";
import { cn } from "@/lib/utils.ts";

export const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const colorClass = (color: GoalColor | null | undefined) => `cp-c-${color ?? "none"}`;

export const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export function scheduleLabel(rule: ScheduleRule): string {
  if (rule.rule === "daily") return "Every day";
  if (rule.rule === "per_week")
    return rule.perWeek === 1 ? "Once a week" : `${rule.perWeek}× a week`;
  const d = rule.days;
  if (d.length === 5 && d.every((x, i) => x === i)) return "Weekdays";
  if (d.length === 2 && d[0] === 5 && d[1] === 6) return "Weekends";
  return d.map((x) => DAY_NAMES[x]).join(", ");
}

export const currentRule = (habit: CompassHabit) => habit.schedules.at(-1)!;

/** 8000 steps → "8k"; minutes and the rest stay as typed. */
export function amount(value: number, unit: string | null): string {
  const n =
    unit?.toLowerCase() === "steps" && value >= 1000
      ? `${+(value / 1000).toFixed(1)}k`
      : `${+value.toFixed(1)}`;
  return unit ? `${n} ${unit}` : n;
}

/** Step size for the − / + buttons, scaled to the target. */
export function stepFor(habit: CompassHabit): number {
  const t = habit.target ?? 1;
  if (t >= 5000) return 1000;
  if (t >= 500) return 100;
  if (t >= 60) return 15;
  if (t >= 20) return 5;
  return 1;
}

export function PaceBar({ progress, elapsed }: { progress: number; elapsed: number }) {
  return (
    <span
      className="cp-bar"
      role="img"
      aria-label={`${pct(progress)} done; ${pct(elapsed)} of the quarter has passed`}
    >
      <i style={{ transform: `scaleX(${progress})` }} />
      <u style={{ left: `${elapsed * 100}%` }} />
    </span>
  );
}

export function GoalStatus({
  progress,
  onPace,
  consistency,
}: {
  progress: number | null;
  onPace: boolean | null;
  consistency: number | null;
}) {
  if (progress === null) {
    return <span className="cp-status cp-status--plain">{pct(consistency)} consistent</span>;
  }
  return (
    <span className={cn("cp-status", onPace ? "cp-status--ok" : "cp-status--behind")}>
      {onPace ? "On track" : "Behind"} · {pct(progress)}
    </span>
  );
}

/** Shade for a 0–1 ratio in the goal's colour. */
export const shade = (r: number) =>
  `color-mix(in srgb, var(--c) ${Math.round(18 + r * 82)}%, var(--bg-2))`;

export function WeekStrip({
  weeks,
  current,
  thin,
  label,
}: {
  weeks: (number | null)[];
  current: number;
  thin?: boolean;
  label: string;
}) {
  return (
    <div
      className={cn("cp-weeks", thin && "cp-weeks--thin")}
      style={{ "--n": weeks.length } as CSSProperties}
      role="img"
      aria-label={label}
    >
      {weeks.map((r, i) => (
        <i
          key={i}
          className={cn(i > current && "is-future", i === current && "is-now")}
          style={i <= current && r !== null ? { background: shade(r) } : undefined}
          title={i <= current ? `Week ${i + 1}: ${pct(r)}` : `Week ${i + 1}`}
        />
      ))}
    </div>
  );
}

export function Passes({ left, total }: { left: number; total: number }) {
  return (
    <span
      className="cp-passes"
      role="img"
      aria-label={`${left} of ${total} passes left this quarter`}
    >
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i >= left ? "is-used" : undefined} />
      ))}
    </span>
  );
}

export function StreakBadge({ view }: { view: HabitView }) {
  const n = view.streak.current;
  if (n < 2) return null;
  return (
    <span className="cp-streak cp-num" title={`${n} in a row`}>
      <span aria-hidden="true">🔥</span> {n}
      <span className="sr-only"> in a row</span>
    </span>
  );
}

const Tick = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

/** One habit, ready to tick (or step an amount) for today. */
export function CheckRow({
  view,
  onLog,
  sub,
}: {
  view: HabitView;
  onLog: (value: number) => void;
  sub?: string;
}) {
  const { habit } = view;
  const color = colorClass(view.goal?.color);
  const weekLine =
    view.thisWeek.done >= view.thisWeek.target &&
    view.thisWeek.target > 0 &&
    currentRule(habit).rule === "per_week"
      ? null
      : sub;

  if (habit.kind === "count") {
    const step = stepFor(habit);
    const target = habit.target ?? 1;
    return (
      <div className={cn("cp-check", color)} aria-pressed={view.metToday}>
        <button
          type="button"
          className="cp-box"
          aria-label={
            view.metToday ? `Clear ${habit.name} for today` : `Mark ${habit.name} done for today`
          }
          onClick={() => onLog(view.metToday ? 0 : target)}
        >
          <Tick />
        </button>
        <span style={{ minWidth: 0 }}>
          <span className="cp-name">{habit.name}</span>
          <small className="cp-num">
            {amount(view.value, null)} of {amount(target, habit.unit)}
          </small>
        </span>
        <span className="cp-trail">
          <StreakBadge view={view} />
          <span className="cp-stepper">
            <button
              type="button"
              aria-label={`Log ${step} less`}
              disabled={view.value <= 0}
              onClick={() => onLog(Math.max(0, view.value - step))}
            >
              −
            </button>
            <button
              type="button"
              aria-label={`Log ${step} more`}
              onClick={() => onLog(view.value + step)}
            >
              +
            </button>
          </span>
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn("cp-check", color)}
      aria-pressed={view.metToday}
      onClick={() => onLog(view.metToday ? 0 : 1)}
    >
      <span className="cp-box">
        <Tick />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="cp-name">{habit.name}</span>
        {weekLine ? <small>{weekLine}</small> : null}
      </span>
      <span className="cp-trail">
        <StreakBadge view={view} />
        {view.goal ? <span className="cp-swatch" title={view.goal.name} /> : null}
      </span>
    </button>
  );
}

/** Second line under a habit on Today: progress this week for times-a-week, else its goal. */
export function todaySub(view: HabitView): string {
  const rule = currentRule(view.habit);
  if (rule.rule === "per_week") return `${view.thisWeek.done} of ${view.thisWeek.target} this week`;
  return view.goal?.name ?? "Ongoing";
}
