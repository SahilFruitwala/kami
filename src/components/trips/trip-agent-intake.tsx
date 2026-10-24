import { useState } from "react";
import type { Trip } from "@/lib/api/trips";
import { MAX_TRIP_DAYS } from "@/lib/trip-days.ts";
import { TextArea, TextInput } from "./trip-fields.tsx";
import { type Actions, orNull } from "./trip-board-utils.ts";

const STEPS = [
  { id: "when", title: "When are you going?", hint: "Dates and who is travelling." },
  { id: "budget", title: "What is the budget?", hint: "A rough nightly or trip total is enough." },
  {
    id: "pace",
    title: "How do you like to travel?",
    hint: "Pace, food, must-sees, and anything to avoid.",
  },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/**
 * Three short questions before the chat opens when dates, budget, or
 * preferences are still blank. Saves onto the trip board so the agent starts
 * with fewer gaps.
 */
export function TripAgentIntake({
  trip,
  actions,
  onDone,
  onSkip,
}: {
  trip: Trip;
  actions: Actions;
  onDone: () => void;
  onSkip: () => void;
}) {
  const first: StepId = !trip.startDate ? "when" : !trip.budget?.trim() ? "budget" : "pace";
  const [step, setStep] = useState<StepId>(first);
  const [startDate, setStartDate] = useState(trip.startDate ?? "");
  const [days, setDays] = useState(String(trip.dayCount));
  const [travelers, setTravelers] = useState(trip.travelers ? String(trip.travelers) : "");
  const [budget, setBudget] = useState(trip.budget ?? "");
  const [preferences, setPreferences] = useState(trip.preferences ?? "");
  const busy = actions.update.isPending;
  const p = `intake-${trip.id}`;
  const index = STEPS.findIndex((s) => s.id === step);
  const meta = STEPS[index] ?? STEPS[0];

  function goNext() {
    if (step === "when") setStep("budget");
    else if (step === "budget") setStep("pace");
  }

  function saveStep(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (step === "when") {
      const people = Number.parseInt(travelers, 10);
      actions.update.mutate(
        {
          startDate: startDate || null,
          dayCount: Math.min(
            MAX_TRIP_DAYS,
            Math.max(1, Number.parseInt(days, 10) || trip.dayCount),
          ),
          travelers: Number.isFinite(people) && people > 0 ? Math.min(20, people) : null,
        },
        { onSuccess: goNext },
      );
      return;
    }

    if (step === "budget") {
      if (!budget.trim()) return;
      actions.update.mutate({ budget: orNull(budget) }, { onSuccess: goNext });
      return;
    }

    if (!preferences.trim()) return;
    actions.update.mutate({ preferences: orNull(preferences) }, { onSuccess: onDone });
  }

  return (
    <section aria-label="Trip planning intake" className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line bg-paper px-4 py-3">
        <p className="kami-label text-ink-muted">
          Step {index + 1} of {STEPS.length}
        </p>
        <h2 className="mt-1 font-display text-xl text-ink">{meta.title}</h2>
        <p className="mt-1 font-body text-sm text-ink-soft">{meta.hint}</p>
      </div>

      <form className="flex min-h-0 flex-1 flex-col" onSubmit={saveStep}>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {step === "when" ? (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
                <TextInput
                  id={`${p}-start`}
                  label="Starts"
                  type="date"
                  value={startDate}
                  onChange={setStartDate}
                />
                <TextInput
                  id={`${p}-days`}
                  label="Days"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_TRIP_DAYS}
                  value={days}
                  onChange={setDays}
                />
              </div>
              <TextInput
                id={`${p}-travelers`}
                label="Travellers"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                value={travelers}
                onChange={setTravelers}
                placeholder="2"
              />
            </>
          ) : null}
          {step === "budget" ? (
            <TextInput
              id={`${p}-budget`}
              label="Budget"
              value={budget}
              onChange={setBudget}
              maxLength={200}
              placeholder="Around €150 a night"
              autoFocus
            />
          ) : null}
          {step === "pace" ? (
            <TextArea
              id={`${p}-pace`}
              label="Pace and interests"
              value={preferences}
              onChange={setPreferences}
              maxLength={2000}
              rows={5}
              placeholder="Food-first, late starts, walkable neighbourhoods, no long day trips…"
            />
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line p-3">
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="font-sans text-xs text-ink-muted hover:text-ink disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="submit"
            disabled={
              busy ||
              (step === "budget" && !budget.trim()) ||
              (step === "pace" && !preferences.trim())
            }
            className="rounded-full bg-hanko px-4 py-2 font-sans text-sm font-medium text-paper hover:bg-shu disabled:opacity-50"
          >
            {step === "pace" ? "Start planning" : "Continue"}
          </button>
        </div>
      </form>
    </section>
  );
}
