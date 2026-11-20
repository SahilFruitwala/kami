import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useCompassActions } from "@/hooks/use-compass.ts";
import type { CompassGoal, CompassHabit } from "@/lib/api/compass";
import { GOAL_COLORS, type GoalColor } from "@/lib/compass/colors";
import { daysBetween, type IsoDay } from "@/lib/compass/dates";
import type { ScheduleRule, Weight } from "@/lib/compass/engine";
import { confirmAction } from "@/lib/confirm.ts";
import { cn } from "@/lib/utils.ts";
import { DAY_LETTERS, DAY_NAMES, colorClass, currentRule, scheduleLabel } from "./compass-ui.tsx";

/** What the add/edit panel is showing, if anything. */
export type SheetState =
  | { kind: "habit"; habit?: CompassHabit; goalId?: string | null }
  | { kind: "goal"; goal?: CompassGoal }
  | null;

function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="cp-scrim" />
        <Dialog.Popup className="cp-sheet rd-ui">
          <div className="cp-sheet-head">
            <Dialog.Title render={<h2 />}>{title}</Dialog.Title>
            <Dialog.Close className="cp-x" aria-label="Close">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="cp-sheet-body">{children}</div>
          {footer ? <div className="cp-sheet-foot">{footer}</div> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="cp-seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

// ---------- Habit ----------

type RuleKind = ScheduleRule["rule"];

export function HabitSheet({
  state,
  goals,
  today,
  onClose,
}: {
  state: Extract<SheetState, { kind: "habit" }> | null;
  goals: CompassGoal[];
  today: IsoDay;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!state} onClose={onClose} title={state?.habit ? "Edit habit" : "New habit"}>
      {state ? (
        <HabitForm
          key={state.habit?.id ?? "new"}
          state={state}
          goals={goals}
          today={today}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function HabitForm({
  state,
  goals,
  today,
  onClose,
}: {
  state: Extract<SheetState, { kind: "habit" }>;
  goals: CompassGoal[];
  today: IsoDay;
  onClose: () => void;
}) {
  const actions = useCompassActions();
  const h = state.habit;
  const rule0 = h ? currentRule(h) : null;
  const [name, setName] = useState(h?.name ?? "");
  const [goalId, setGoalId] = useState<string>(h ? (h.goalId ?? "") : (state.goalId ?? ""));
  const [kind, setKind] = useState<"check" | "count">(h?.kind ?? "check");
  const [target, setTarget] = useState<string>(h?.target ? String(h.target) : "30");
  const [unit, setUnit] = useState(h?.unit ?? "min");
  const [ruleKind, setRuleKind] = useState<RuleKind>(rule0?.rule ?? "daily");
  const [days, setDays] = useState<number[]>(rule0?.rule === "days" ? rule0.days : [0, 2, 4]);
  const [perWeek, setPerWeek] = useState(rule0?.rule === "per_week" ? rule0.perWeek : 3);
  const [error, setError] = useState("");

  const schedule: ScheduleRule =
    ruleKind === "daily"
      ? { rule: "daily" }
      : ruleKind === "days"
        ? { rule: "days", days: [...days].sort() }
        : { rule: "per_week", perWeek };
  const busy = actions.createHabit.isPending || actions.updateHabit.isPending;
  const canDelete = h ? daysBetween(h.createdOn, today) < 7 : false;

  async function save() {
    if (!name.trim()) return setError("Give the habit a name.");
    if (ruleKind === "days" && !days.length) return setError("Pick at least one day.");
    const amount = Number(target);
    if (kind === "count" && !(amount > 0)) return setError("Set a daily target above zero.");
    const body = {
      name: name.trim(),
      goalId: goalId || null,
      kind,
      target: kind === "count" ? amount : null,
      unit: kind === "count" ? unit.trim() || null : null,
      schedule,
    };
    try {
      if (h) {
        const same =
          JSON.stringify({ ...currentRule(h), startsOn: undefined }) ===
          JSON.stringify({ ...schedule, startsOn: undefined });
        await actions.updateHabit.mutateAsync({
          id: h.id,
          patch: { ...body, schedule: same ? undefined : schedule },
        });
      } else {
        await actions.createHabit.mutateAsync(body);
      }
      onClose();
    } catch {
      /* toast shown by the mutation */
    }
  }

  async function archive() {
    if (!h) return;
    const ok = await confirmAction({
      title: `Archive ${h.name}?`,
      description: "It leaves Today and stops counting. Its past weeks stay in the history.",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    await actions.updateHabit.mutateAsync({ id: h.id, patch: { archived: true } }).catch(() => {});
    onClose();
  }

  async function remove() {
    if (!h) return;
    const ok = await confirmAction({
      title: `Delete ${h.name}?`,
      description: "It's less than a week old, so it can be removed completely, check-ins and all.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await actions.deleteHabit.mutateAsync(h.id).catch(() => {});
    onClose();
  }

  const preview = (
    <>
      <b>{name.trim() || "This habit"}</b>
      {kind === "count" ? ` · ${Number(target) || 0} ${unit}` : ""} ·{" "}
      {ruleKind === "days" && !days.length
        ? "pick at least one day"
        : scheduleLabel(schedule).toLowerCase()}
    </>
  );

  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="cp-field">
        <span>Name</span>
        <input
          id="cp-habit-name"
          className="cp-input"
          value={name}
          onChange={(e) => (setName(e.target.value), setError(""))}
          placeholder="Study, Run, Floss…"
          autoComplete="off"
          autoFocus
          maxLength={120}
        />
      </label>

      <label className="cp-field">
        <span>Belongs to</span>
        <select
          id="cp-habit-goal"
          className="cp-input"
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
        >
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value="">No goal (ongoing)</option>
        </select>
        <small>Ongoing habits carry over every quarter.</small>
      </label>

      <div className="cp-field">
        <span>How you log it</span>
        <Seg
          label="How you log it"
          value={kind}
          onChange={setKind}
          options={[
            ["check", "Done / not done"],
            ["count", "An amount"],
          ]}
        />
      </div>

      {kind === "count" ? (
        <div className="cp-field">
          <span>Daily target</span>
          <div className="flex gap-2">
            <input
              id="cp-habit-target"
              className="cp-input cp-num"
              style={{ width: 120 }}
              type="number"
              inputMode="decimal"
              min="0"
              value={target}
              onChange={(e) => (setTarget(e.target.value), setError(""))}
              aria-label="Daily target"
            />
            <input
              id="cp-habit-unit"
              className="cp-input"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="min, steps, pages"
              aria-label="Unit"
              maxLength={24}
            />
          </div>
          <small>The day counts as done once you reach it.</small>
        </div>
      ) : null}

      <div className="cp-field">
        <span>When</span>
        <Seg
          label="When"
          value={ruleKind}
          onChange={setRuleKind}
          options={[
            ["daily", "Every day"],
            ["days", "Specific days"],
            ["per_week", "Times a week"],
          ]}
        />
        {ruleKind === "days" ? (
          <div className="cp-chips" role="group" aria-label="Days">
            {DAY_LETTERS.map((l, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={days.includes(i)}
                aria-label={DAY_NAMES[i]}
                onClick={() => (
                  setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i])),
                  setError("")
                )}
              >
                {l}
              </button>
            ))}
          </div>
        ) : null}
        {ruleKind === "per_week" ? (
          <div className="cp-pernum cp-stepper">
            <button
              type="button"
              aria-label="Fewer times"
              onClick={() => setPerWeek((n) => Math.max(1, n - 1))}
            >
              −
            </button>
            <b className="cp-num">{perWeek}</b>
            <button
              type="button"
              aria-label="More times"
              onClick={() => setPerWeek((n) => Math.min(7, n + 1))}
            >
              +
            </button>
            <span className="cp-hint">times a week, any days</span>
          </div>
        ) : null}
      </div>

      <div className="cp-preview">{preview}</div>
      {h ? (
        <p className="cp-hint">
          Schedule changes apply from this week. Earlier weeks keep their old target.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="cp-status cp-status--behind">
          {error}
        </p>
      ) : null}

      <div
        className="cp-sheet-foot"
        style={{
          margin: "0 -20px -18px",
          position: "sticky",
          bottom: -18,
          background: "var(--card)",
        }}
      >
        {h ? (
          <span className="flex flex-wrap gap-2">
            <button
              type="button"
              className="cp-btn cp-btn--sm"
              onClick={() =>
                void actions.updateHabit
                  .mutateAsync({ id: h.id, patch: { paused: !h.pausedOn } })
                  .then(onClose, () => {})
              }
            >
              {h.pausedOn ? "Resume" : "Pause"}
            </button>
            {canDelete ? (
              <button
                type="button"
                className="cp-btn cp-btn--sm cp-btn--danger"
                onClick={() => void remove()}
              >
                Delete
              </button>
            ) : (
              <button
                type="button"
                className="cp-btn cp-btn--sm cp-btn--danger"
                onClick={() => void archive()}
              >
                Archive
              </button>
            )}
          </span>
        ) : null}
        <span className="cp-right">
          <button type="button" className="cp-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="cp-btn cp-btn--primary" disabled={busy}>
            {h ? "Save" : "Add habit"}
          </button>
        </span>
      </div>
    </form>
  );
}

// ---------- Goal ----------

type DraftMilestone = { id?: string; title: string; dueOn: string; weight: Weight };

export function GoalSheet({
  state,
  quarterBounds,
  onClose,
  onCreated,
  onDropped,
}: {
  state: Extract<SheetState, { kind: "goal" }> | null;
  quarterBounds: { min: IsoDay; max: IsoDay };
  onClose: () => void;
  onCreated: (id: string) => void;
  onDropped: () => void;
}) {
  return (
    <Sheet open={!!state} onClose={onClose} title={state?.goal ? "Edit goal" : "New goal"}>
      {state ? (
        <GoalForm
          key={state.goal?.id ?? "new"}
          goal={state.goal}
          bounds={quarterBounds}
          onClose={onClose}
          onCreated={onCreated}
          onDropped={onDropped}
        />
      ) : null}
    </Sheet>
  );
}

function GoalForm({
  goal,
  bounds,
  onClose,
  onCreated,
  onDropped,
}: {
  goal?: CompassGoal;
  bounds: { min: IsoDay; max: IsoDay };
  onClose: () => void;
  onCreated: (id: string) => void;
  onDropped: () => void;
}) {
  const actions = useCompassActions();
  const [name, setName] = useState(goal?.name ?? "");
  const [why, setWhy] = useState(goal?.why ?? "");
  const [color, setColor] = useState<GoalColor>(goal?.color ?? "persimmon");
  const [ms, setMs] = useState<DraftMilestone[]>(
    goal?.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      dueOn: m.dueOn ?? "",
      weight: m.weight,
    })) ?? [{ title: "", dueOn: "", weight: "M" }],
  );
  const [error, setError] = useState("");
  const busy = actions.createGoal.isPending || actions.updateGoal.isPending;

  const patchMs = (i: number, p: Partial<DraftMilestone>) =>
    setMs((list) => list.map((m, k) => (k === i ? { ...m, ...p } : m)));

  async function save() {
    if (!name.trim()) return setError("Name the goal.");
    const input = {
      name: name.trim(),
      why: why.trim() || null,
      color,
      milestones: ms
        .filter((m) => m.title.trim())
        .map((m) => ({
          id: m.id,
          title: m.title.trim(),
          dueOn: m.dueOn || null,
          weight: m.weight,
        })),
    };
    try {
      if (goal) {
        await actions.updateGoal.mutateAsync({ id: goal.id, input });
        onClose();
      } else {
        const { id } = await actions.createGoal.mutateAsync(input);
        onClose();
        onCreated(id);
      }
    } catch {
      /* toast shown by the mutation */
    }
  }

  async function drop() {
    if (!goal) return;
    const ok = await confirmAction({
      title: `Drop ${goal.name}?`,
      description:
        "It leaves this quarter and its habits are archived. You'll still see it in the year view.",
      confirmLabel: "Drop goal",
      destructive: true,
    });
    if (!ok) return;
    await actions.dropGoal.mutateAsync(goal.id).catch(() => {});
    onClose();
    onDropped();
  }

  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="cp-field">
        <span>Goal</span>
        <input
          id="cp-goal-name"
          className="cp-input"
          value={name}
          onChange={(e) => (setName(e.target.value), setError(""))}
          placeholder="Learn AWS"
          autoComplete="off"
          autoFocus
          maxLength={120}
        />
      </label>
      <label className="cp-field">
        <span>Why it matters</span>
        <textarea
          id="cp-goal-why"
          className="cp-input"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="One line you'll read when motivation dips"
          maxLength={400}
        />
      </label>
      <div className="cp-field">
        <span>Colour</span>
        <div className="cp-swatches" role="group" aria-label="Colour">
          {GOAL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={colorClass(c)}
              aria-pressed={c === color}
              aria-label={c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </div>
      <div className="cp-field">
        <span>Milestones</span>
        <small>Dated results that show you got there. L counts three times as much as S.</small>
        <div className="grid gap-2">
          {ms.map((m, i) => (
            <div key={m.id ?? `new-${i}`} className="cp-msedit">
              <input
                className="cp-input"
                value={m.title}
                onChange={(e) => patchMs(i, { title: e.target.value })}
                placeholder="Practice exam ≥ 72%"
                aria-label={`Milestone ${i + 1}`}
                maxLength={160}
              />
              <input
                className="cp-input cp-num"
                type="date"
                value={m.dueOn}
                min={bounds.min}
                max={bounds.max}
                onChange={(e) => patchMs(i, { dueOn: e.target.value })}
                aria-label={`Milestone ${i + 1} due date`}
              />
              <select
                className="cp-input"
                value={m.weight}
                onChange={(e) => patchMs(i, { weight: e.target.value as Weight })}
                aria-label={`Milestone ${i + 1} size`}
              >
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
              </select>
              <button
                type="button"
                className="cp-x"
                aria-label={`Remove milestone ${i + 1}`}
                onClick={() => setMs((list) => list.filter((_, k) => k !== i))}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="cp-btn cp-btn--sm"
          style={{ justifySelf: "start" }}
          disabled={ms.length >= 12}
          onClick={() => setMs((list) => [...list, { title: "", dueOn: "", weight: "M" }])}
        >
          + Add milestone
        </button>
      </div>
      {!goal ? (
        <p className="cp-hint">You'll add habits on the goal's page after creating it.</p>
      ) : null}
      {error ? (
        <p role="alert" className="cp-status cp-status--behind">
          {error}
        </p>
      ) : null}
      <div
        className={cn("cp-sheet-foot")}
        style={{
          margin: "0 -20px -18px",
          position: "sticky",
          bottom: -18,
          background: "var(--card)",
        }}
      >
        {goal ? (
          <button
            type="button"
            className="cp-btn cp-btn--sm cp-btn--danger"
            onClick={() => void drop()}
          >
            Drop goal
          </button>
        ) : null}
        <span className="cp-right">
          <button type="button" className="cp-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="cp-btn cp-btn--primary" disabled={busy}>
            {goal ? "Save" : "Create goal"}
          </button>
        </span>
      </div>
    </form>
  );
}
