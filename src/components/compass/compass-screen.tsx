import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import {
  addTransitionType,
  startTransition,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AppShell } from "@/components/app-shell.tsx";
import { enter } from "@/components/home/today-desk.tsx";
import {
  useCompass,
  useCompassActions,
  useLogHabit,
  useSetWeekStart,
} from "@/hooks/use-compass.ts";
import { addDays, quarterRange, shortDay, type IsoDay } from "@/lib/compass/dates";
import type { CompassModel, GoalView, HabitView } from "@/lib/compass/model";
import type { LibraryItem } from "@/lib/library-item.ts";
import { cn } from "@/lib/utils.ts";
import { GoalSheet, HabitSheet, type SheetState } from "./compass-sheets.tsx";
import {
  DAY_LETTERS,
  GoalStatus,
  PaceBar,
  Passes,
  amount,
  colorClass,
  currentRule,
  pct,
  scheduleLabel,
  WeekStrip,
} from "./compass-ui.tsx";

/** `goalId` "ongoing" shows the habits that aren't tied to a goal. */
export type CompassView = { page: "overview" } | { page: "goal"; goalId: string };

export function CompassScreen({ view }: { view: CompassView }) {
  const navigate = useNavigate();
  const openItem = (item: LibraryItem) =>
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });

  return (
    <AppShell active="compass" onOpenItem={openItem}>
      <CompassBody view={view} />
    </AppShell>
  );
}

function CompassBody({ view }: { view: CompassView }) {
  const { model, data: snap, isLoading, error } = useCompass();
  const [sheet, setSheet] = useState<SheetState>(null);
  const navigate = useNavigate();

  if (isLoading || !model || !snap) {
    return (
      <div className="cp-wrap">
        <p className="cp-note">
          {error ? "Compass couldn't load. Refresh to try again." : "Loading Compass…"}
        </p>
      </div>
    );
  }

  const q = snap.quarter;
  const bounds = { min: model.weeks[0]!, max: addDays(model.weeks.at(-1)!, 6) };
  const route = view.page === "overview" ? "overview" : view.goalId;
  const goalView =
    view.page === "goal" ? model.goals.find((g) => g.goal.id === view.goalId) : undefined;

  return (
    <div className="cp-wrap">
      <Side
        model={model}
        quarterLabel={`Q${q.quarter} ${q.year}`}
        range={quarterRange(q)}
        route={route}
        onNew={setSheet}
      />

      <main className="cp-page" key={route}>
        {view.page === "overview" ? (
          <Overview model={model} weekStart={snap.weekStart} onNew={setSheet} />
        ) : view.goalId === "ongoing" ? (
          <HabitsPage model={model} goal={null} onSheet={setSheet} />
        ) : goalView ? (
          <HabitsPage model={model} goal={goalView} onSheet={setSheet} />
        ) : (
          <div className="cp-card cp-empty">
            <h3>That goal isn't in this quarter</h3>
            <p>It may have been dropped or finished.</p>
            <Link to="/compass" className="cp-link">
              Back to the overview <span>→</span>
            </Link>
          </div>
        )}
      </main>

      <HabitSheet
        state={sheet?.kind === "habit" ? sheet : null}
        goals={snap.goals}
        today={model.today}
        onClose={() => setSheet(null)}
      />
      <GoalSheet
        state={sheet?.kind === "goal" ? sheet : null}
        quarterBounds={bounds}
        onClose={() => setSheet(null)}
        onCreated={(id) => void navigate({ to: "/compass/goal/$id", params: { id } })}
        onDropped={() => void navigate({ to: "/compass" })}
      />
    </div>
  );
}

// ---------- Side navigation ----------

function Side({
  model,
  quarterLabel,
  range,
  route,
  onNew,
}: {
  model: CompassModel;
  quarterLabel: string;
  range: string;
  route: string;
  onNew: (s: SheetState) => void;
}) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  // On phones the page list is a sideways-scrolling row: keep the current page in view.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2;
  }, [route]);
  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);
  const pick = (s: SheetState) => {
    setMenu(false);
    onNew(s);
  };
  const goalHabitsPct = (g: GoalView) =>
    g.progress === null ? pct(g.consistency) : pct(g.progress);

  return (
    <aside className="cp-side" aria-label="Compass">
      <div className="cp-qhead">
        <h1>{quarterLabel}</h1>
        <span className="cp-note">{range}</span>
      </div>
      <div className="cp-time">
        <span className="cp-time-track">
          <i style={{ transform: `scaleX(${model.elapsed})` }} />
        </span>
        <span className="cp-note cp-num">
          Week {model.weekNumber} of {model.weekCount} · {model.daysLeft} days left
        </span>
      </div>
      <div className="cp-new" ref={ref}>
        <button
          type="button"
          className="cp-btn cp-btn--primary"
          style={{ width: "100%" }}
          aria-expanded={menu}
          aria-haspopup="menu"
          onClick={() => setMenu((m) => !m)}
        >
          <Plus className="size-4" aria-hidden="true" /> New
        </button>
        {menu ? (
          <div className="cp-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => pick({ kind: "goal" })}>
              <b>Goal</b>
              <small>An outcome with dated milestones</small>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                pick({
                  kind: "habit",
                  goalId: route !== "overview" && route !== "ongoing" ? route : null,
                })
              }
            >
              <b>Habit</b>
              <small>Something you repeat, with or without a goal</small>
            </button>
          </div>
        ) : null}
      </div>
      <nav ref={navRef} className="cp-nav" aria-label="Compass pages">
        <Link
          to="/compass"
          activeOptions={{ exact: true }}
          aria-current={route === "overview" ? "page" : undefined}
        >
          Overview
        </Link>
        {model.goals.length ? <small>Goals</small> : null}
        {model.goals.map((g) => (
          <Link
            key={g.goal.id}
            to="/compass/goal/$id"
            params={{ id: g.goal.id }}
            className={colorClass(g.goal.color)}
            aria-current={route === g.goal.id ? "page" : undefined}
          >
            <span className="cp-swatch" />
            {g.goal.name}
            <span className="cp-num">{goalHabitsPct(g)}</span>
          </Link>
        ))}
        {model.ongoing.length ? (
          <>
            <small>Habits</small>
            <Link
              to="/compass/goal/$id"
              params={{ id: "ongoing" }}
              className="cp-c-none"
              aria-current={route === "ongoing" ? "page" : undefined}
            >
              <span className="cp-swatch" />
              Ongoing habits
              <span className="cp-num">{model.ongoing.length}</span>
            </Link>
          </>
        ) : null}
      </nav>
    </aside>
  );
}

// ---------- Overview ----------

function Overview({
  model,
  weekStart,
  onNew,
}: {
  model: CompassModel;
  weekStart: 0 | 1;
  onNew: (s: SheetState) => void;
}) {
  const current = model.weekNumber - 1;
  const combined = model.weeks.map((_, i) => {
    const xs = model.habits.map((h) => h.weeks[i]).filter((x): x is number => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  });
  const empty = !model.goals.length && !model.habits.length;
  const longest = model.habits.reduce<HabitView | null>(
    (best, h) => (h.streak.current > (best?.streak.current ?? 1) ? h : best),
    null,
  );

  if (empty) {
    return (
      <>
        <div className="cp-ph cp-enter">
          <span className="cp-crumb">Overview</span>
          <h2>Plan the quarter</h2>
          <p>
            Pick one to three goals for these {model.weekCount} weeks, give each a few dated
            milestones, then add the habits that move them. Habits can also stand on their own.
          </p>
        </div>
        <div className="cp-card cp-empty cp-enter" style={enter(60)}>
          <h3>Start with a goal</h3>
          <p>
            Something you'd be glad to have done by the end of the quarter, like "Pass the AWS
            exam".
          </p>
          <span className="flex flex-wrap gap-2">
            <button
              type="button"
              className="cp-btn cp-btn--primary"
              onClick={() => onNew({ kind: "goal" })}
            >
              New goal
            </button>
            <button
              type="button"
              className="cp-btn"
              onClick={() => onNew({ kind: "habit", goalId: null })}
            >
              Just a habit
            </button>
          </span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="cp-ph cp-enter">
        <span className="cp-crumb">Overview</span>
        <h2>Where the quarter stands</h2>
        <p>Each bar is milestones done. The black tick is how much of the quarter has passed.</p>
      </div>

      <PassNotes model={model} />

      {model.goals.length || model.ongoing.length ? (
        <div className="cp-card cp-enter" style={enter(40)}>
          {model.goals.map((g) => (
            <Link
              key={g.goal.id}
              to="/compass/goal/$id"
              params={{ id: g.goal.id }}
              className={cn("cp-goalrow", colorClass(g.goal.color))}
            >
              <span className="cp-goalname">
                <span className="cp-swatch" style={{ width: 10, height: 10 }} />
                <span>{g.goal.name}</span>
              </span>
              <GoalStatus progress={g.progress} onPace={g.onPace} consistency={g.consistency} />
              {g.progress !== null ? (
                <PaceBar progress={g.progress} elapsed={model.elapsed} />
              ) : null}
              <span className="cp-meta">
                {g.next ? (
                  <span>
                    Next <b>{g.next.title}</b>
                    {g.next.dueOn ? ` · ${shortDay(g.next.dueOn)}` : ""}
                  </span>
                ) : g.goal.milestones.length ? (
                  <span>All milestones done</span>
                ) : (
                  <span>No milestones yet</span>
                )}
                <span>
                  Habits <b>{pct(g.consistency)}</b>
                </span>
                <span>
                  This week{" "}
                  <b className="cp-num">
                    {g.weekDone}/{g.weekTarget}
                  </b>
                </span>
              </span>
            </Link>
          ))}
          {model.ongoing.length ? (
            <Link
              to="/compass/goal/$id"
              params={{ id: "ongoing" }}
              className="cp-goalrow cp-c-none"
            >
              <span className="cp-goalname">
                <span className="cp-swatch" style={{ width: 10, height: 10 }} />
                <span>Ongoing habits</span>
              </span>
              <span className="cp-status cp-status--plain">
                {pct(avg(model.ongoing.map((h) => h.consistency)))} consistent
              </span>
              <span className="cp-meta">
                <span>{model.ongoing.map((h) => h.habit.name).join(", ")}</span>
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}

      {model.habits.length ? (
        <section className="cp-sect cp-enter" style={enter(80)}>
          <h3>Week by week</h3>
          <div
            className="cp-card"
            style={
              {
                padding: "16px 18px",
                display: "grid",
                gap: 10,
                ["--c" as string]: "var(--ink-2)",
              } as CSSProperties
            }
          >
            <WeekStrip
              weeks={combined}
              current={current}
              label="Share of habit targets hit, week by week"
            />
            <div
              className="cp-weeklabels cp-num"
              style={{ "--n": model.weeks.length } as CSSProperties}
            >
              {model.weeks.map((_, i) => (
                <span
                  key={i}
                  style={i === current ? { color: "var(--ink)", fontWeight: 600 } : undefined}
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <span className="cp-note">
              All habits combined.
              {longest
                ? ` Longest streak: ${longest.habit.name}, ${longest.streak.current} in a row.`
                : ""}
            </span>
          </div>
        </section>
      ) : null}

      <WeekStartSetting weekStart={weekStart} />
    </>
  );
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function PassNotes({ model }: { model: CompassModel }) {
  if (!model.passNotes.length) return null;
  return (
    <p className="cp-note cp-enter" role="status">
      {model.passNotes
        .map((h) => `Used a pass on ${h.habit.name} yesterday · ${h.streak.passesLeft} left`)
        .join(". ")}
      .
    </p>
  );
}

function WeekStartSetting({ weekStart }: { weekStart: 0 | 1 }) {
  const set = useSetWeekStart();
  return (
    <label className="cp-note flex items-center gap-2">
      Weeks start on
      <select
        id="cp-week-start"
        className="cp-input"
        style={{ width: "auto", padding: "4px 8px", fontSize: 13 }}
        value={weekStart}
        disabled={set.isPending}
        onChange={(e) => set.mutate(Number(e.target.value) as 0 | 1)}
      >
        <option value={1}>Monday</option>
        <option value={0}>Sunday</option>
      </select>
    </label>
  );
}

// ---------- Goal page (and ongoing habits) ----------

function HabitsPage({
  model,
  goal,
  onSheet,
}: {
  model: CompassModel;
  goal: GoalView | null;
  onSheet: (s: SheetState) => void;
}) {
  const actions = useCompassActions();
  const habits = goal ? goal.habits : model.ongoing;
  const color = colorClass(goal?.goal.color);
  const current = model.weekNumber - 1;

  return (
    <>
      <div className={cn("cp-ph cp-enter", color)}>
        <span className="cp-crumb">
          <Link to="/compass">Overview</Link> / {goal ? "Goal" : "Habits"}
        </span>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2>{goal ? goal.goal.name : "Ongoing habits"}</h2>
          {goal ? (
            <button
              type="button"
              className="cp-btn cp-btn--sm"
              onClick={() => onSheet({ kind: "goal", goal: goal.goal })}
            >
              Edit goal
            </button>
          ) : null}
        </div>
        <p>
          {goal
            ? goal.goal.why || "No reason written yet."
            : "Habits that aren't tied to a goal. They carry over every quarter."}
        </p>
      </div>

      {goal ? (
        <div className="cp-stats cp-enter" style={enter(40)}>
          <div className="cp-card cp-stat">
            <small>Status</small>
            <b className="cp-num">{pct(goal.progress)}</b>
            <span>
              {goal.progress === null ? "No milestones" : goal.onPace ? "On track" : "Behind pace"}
            </span>
          </div>
          <div className="cp-card cp-stat">
            <small>Habits</small>
            <b className="cp-num">{pct(goal.consistency)}</b>
            <span>
              {goal.consistency === null
                ? "Counts after the first full week"
                : "of weekly targets hit"}
            </span>
          </div>
          <div className="cp-card cp-stat">
            <small>This week</small>
            <b className="cp-num">
              {goal.weekDone}/{goal.weekTarget}
            </b>
            <span>check-ins so far</span>
          </div>
        </div>
      ) : null}

      {goal && goal.goal.milestones.length ? (
        <section className="cp-sect cp-enter" style={enter(70)}>
          <h3>Milestones</h3>
          <div className={cn("cp-card cp-ms", color)}>
            {goal.goal.milestones.map((m) => {
              const isNext = goal.next?.id === m.id;
              return (
                <div
                  key={m.id}
                  className={cn("cp-msrow", m.done && "is-done", isNext && "is-next")}
                >
                  <button
                    type="button"
                    aria-pressed={m.done}
                    aria-label={`${m.title}: mark ${m.done ? "not done" : "done"}`}
                    onClick={() => actions.setMilestone.mutate({ id: m.id, done: !m.done })}
                  >
                    <span className="cp-dia" />
                  </button>
                  <span className="cp-mt">
                    {m.title}
                    {m.weight !== "M" ? <span className="cp-note"> · {m.weight}</span> : null}
                  </span>
                  <span className="cp-when cp-num">
                    {m.dueOn ? shortDay(m.dueOn) : "No date"}
                    {isNext ? <em>next up</em> : null}
                  </span>
                </div>
              );
            })}
          </div>
          <span className="cp-note">Tap a diamond to mark a milestone done.</span>
        </section>
      ) : null}

      <section className="cp-sect cp-enter" style={enter(100)}>
        <h3>Habits</h3>
        <div className={cn("cp-card", color)}>
          {habits.length ? (
            habits.map((h) => (
              <HabitDetail
                key={h.habit.id}
                view={h}
                current={current}
                onEdit={() => onSheet({ kind: "habit", habit: h.habit })}
              />
            ))
          ) : (
            <p className="cp-note" style={{ padding: "16px 18px" }}>
              No habits yet. Habits are what you repeat to move this goal forward.
            </p>
          )}
          <button
            type="button"
            className="cp-addrow"
            onClick={() => onSheet({ kind: "habit", goalId: goal ? goal.goal.id : null })}
          >
            <Plus className="size-4" aria-hidden="true" /> Add habit
            {goal ? ` to ${goal.goal.name}` : ""}
          </button>
        </div>
      </section>
    </>
  );
}

function HabitDetail({
  view,
  current,
  onEdit,
}: {
  view: HabitView;
  current: number;
  onEdit: () => void;
}) {
  const log = useLogHabit();
  const { habit, streak } = view;
  const rule = currentRule(habit);
  const toggle = (day: IsoDay, met: boolean) =>
    log.mutate({
      habitId: habit.id,
      day,
      value: met ? 0 : habit.kind === "count" ? (habit.target ?? 1) : 1,
    });
  const met = view.thisWeek.target > 0 && view.thisWeek.done >= view.thisWeek.target;

  return (
    <div className="cp-hcard">
      <div className="cp-hhead">
        <span>
          <b>{habit.name}</b>{" "}
          <span className="cp-sub">
            · {scheduleLabel(rule)}
            {habit.kind === "count" && habit.target ? ` · ${amount(habit.target, habit.unit)}` : ""}
            {view.paused ? " · paused" : ""}
          </span>
        </span>
        <span className="cp-hstats">
          <span className="cp-num">{pct(view.consistency)} this quarter</span>
          <button type="button" className="cp-btn cp-btn--sm" onClick={onEdit}>
            Edit
          </button>
        </span>
      </div>
      <WeekStrip thin weeks={view.weeks} current={current} label={`${habit.name}, week by week`} />
      <div className="cp-days">
        {view.days.map((d, i) => (
          <button
            key={d.day}
            type="button"
            className={cn(
              "cp-day",
              d.met && "is-met",
              !d.met && !d.scheduled && "is-off",
              d.isToday && "is-today",
              d.future && "is-future",
              !d.active && !d.future && "is-inactive",
            )}
            disabled={!d.editable || !d.active}
            aria-pressed={d.met}
            aria-label={`${habit.name}, ${shortDay(d.day)}${d.met ? ", done" : ""}`}
            onClick={() => toggle(d.day, d.met)}
          >
            {DAY_LETTERS[(Number(new Date(`${d.day}T00:00:00Z`).getUTCDay()) + 6) % 7] ??
              DAY_LETTERS[i]}
          </button>
        ))}
        <span className="cp-note cp-num" style={{ marginLeft: 4 }}>
          {view.thisWeek.done}/{view.thisWeek.target}
        </span>
        {met ? <span className="cp-met">Weekly target met</span> : null}
      </div>
      <div className="cp-hstats">
        <span className="cp-num">
          🔥 {streak.current} now · best {streak.best}
        </span>
        <span className="flex items-center gap-2">
          <Passes left={streak.passesLeft} total={streak.passesTotal} />
          <span className="cp-note">passes</span>
        </span>
      </div>
    </div>
  );
}
