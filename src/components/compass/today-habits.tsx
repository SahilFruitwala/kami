import { Link } from "@tanstack/react-router";
import { useCompass, useLogHabit } from "@/hooks/use-compass.ts";
import { CheckRow, todaySub } from "./compass-ui.tsx";

/**
 * Today's habits on the home desk: tick them off without leaving home. Hidden
 * until there is at least one habit.
 */
export function TodayHabits() {
  const { model } = useCompass();
  const log = useLogHabit();
  if (!model || !model.habits.length) return null;

  const list = model.todayList;
  const done = list.filter((h) => h.metToday).length;
  const behind = model.goals.filter((g) => g.onPace === false);
  const note = model.passNotes[0];

  return (
    <section className="cp-card cp-today rd-enter" aria-labelledby="cp-today-title">
      <div className="cp-today-head">
        <h3 id="cp-today-title">Today's habits</h3>
        <span className="cp-progress">
          <span className="cp-num">
            {done}/{list.length}
          </span>
          <span aria-hidden="true">
            <i style={{ transform: `scaleX(${list.length ? done / list.length : 0})` }} />
          </span>
        </span>
      </div>
      {list.length ? (
        <div>
          {list.map((h) => (
            <CheckRow
              key={h.habit.id}
              view={h}
              sub={todaySub(h)}
              onLog={(value) => log.mutate({ habitId: h.habit.id, day: model.today, value })}
            />
          ))}
        </div>
      ) : (
        <p className="cp-alldone">Nothing due today.</p>
      )}
      <div className="cp-today-foot">
        <span>
          {note
            ? `Used a pass on ${note.habit.name} yesterday · ${note.streak.passesLeft} left`
            : behind.length
              ? `${behind.map((g) => g.goal.name).join(", ")} ${behind.length === 1 ? "is" : "are"} behind pace`
              : model.goals.length
                ? "Goals on track"
                : ""}
        </span>
        <Link to="/compass" className="cp-link">
          Open Compass <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
