/**
 * Folds what linked reading added to a habit into its check-ins. Pure.
 *
 * Contributions live apart from `compass_logs` so a manual tick and an
 * automatic one never overwrite each other. Only a done/not-done habit takes
 * them as check-ins: a counted habit keeps its own number, and the
 * contribution stays as detail.
 */
import type { CompassContribution, CompassHabit, CompassLog } from "@/lib/api/compass";

export function withAutoLogs(
  logs: CompassLog[],
  contributions: CompassContribution[],
  habits: Pick<CompassHabit, "id" | "kind">[],
): CompassLog[] {
  const checks = new Set(habits.filter((h) => h.kind === "check").map((h) => h.id));
  const seen = new Set(logs.map((l) => `${l.habitId}|${l.day}`));
  const out = logs.slice();
  for (const c of contributions) {
    if (!c.counted || !checks.has(c.habitId)) continue;
    const key = `${c.habitId}|${c.day}`;
    // A manual check-in stays the record for that day; several links share one tick.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ habitId: c.habitId, day: c.day, value: 1, auto: true });
  }
  return out;
}
