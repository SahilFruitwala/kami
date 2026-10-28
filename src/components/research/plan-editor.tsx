import { useState } from "react";
import { LoaderCircle, Play, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Segmented } from "@/components/gloss/primitives.tsx";
import { useResearchRefresh } from "@/hooks/use-research.ts";
import { researchApi, type RunView } from "@/lib/api/research.ts";
import { errorMessage } from "@/lib/errors";
import { estimateRun } from "@/lib/research/estimate.ts";
import type { Depth, PlanQuery, RunKind } from "@/lib/research/kinds.ts";
import { cn } from "@/lib/utils.ts";

const INTENT_LABEL: Record<PlanQuery["intent"], string> = {
  pain: "Complaints",
  wish: "Wishes",
  switching: "Switching",
  alternatives: "Alternatives",
  pricing: "Pricing",
  counter: "Counter-evidence",
};

/**
 * The plan screen: every search the run will make, to check, edit, add or
 * remove; repeats start unchecked. Shows the estimate for the chosen depth
 * and the balance; Run is disabled when the balance can't cover the budget.
 */
export function PlanEditor({ view }: { view: RunView }) {
  const refresh = useResearchRefresh();
  const [plan, setPlan] = useState<PlanQuery[]>(view.run.plan);
  const [depth, setDepth] = useState<Depth>(view.run.depth);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"start" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checked = plan.filter((q) => q.checked !== false);
  // Recomputed as the plan changes (the server's figures are for the saved plan).
  const estimate = estimateRun(plan, depth, view.run.kind as RunKind);
  const short = view.balance < estimate.budget;

  const update = (id: string, patch: Partial<PlanQuery>) =>
    setPlan((p) => p.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  function add(e: React.FormEvent) {
    e.preventDefault();
    const query = draft.trim();
    if (!query) return;
    const id = `u${Date.now().toString(36)}`;
    setPlan((p) => [...p, { id, query, intent: "pain", checked: true }]);
    setDraft("");
  }

  async function act(kind: "start" | "discard") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "start") await researchApi.start(view.run.id, { depth, plan });
      else await researchApi.stop(view.run.id);
      refresh();
    } catch (err) {
      setError(errorMessage(err, "Something went wrong. Try again in a moment."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Searches" className="kami-sheet p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl text-ink">The plan</h2>
          <span className="font-sans text-xs text-ink-muted">
            {checked.length} of {plan.length} searches will run
          </span>
        </div>
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {plan.map((q) => (
            <li key={q.id} className="flex items-start gap-3 py-2.5">
              <input
                type="checkbox"
                aria-label={`Search: ${q.query}`}
                checked={q.checked !== false}
                onChange={(e) => update(q.id, { checked: e.target.checked })}
                className="mt-2.5 size-4 shrink-0 accent-persimmon"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Input
                  value={q.query}
                  maxLength={300}
                  aria-label="Search text"
                  onChange={(e) => update(q.id, { query: e.target.value })}
                  className={cn(q.checked === false && "text-ink-muted")}
                />
                <span className="flex flex-wrap gap-x-3 font-sans text-[11px] text-ink-muted">
                  <span>{q.site ?? "the open web"}</span>
                  <span>{INTENT_LABEL[q.intent]}</span>
                  {q.repeat ? <span className="text-hanko">Already searched</span> : null}
                </span>
              </div>
              <button
                type="button"
                aria-label={`Remove: ${q.query}`}
                onClick={() => setPlan((p) => p.filter((x) => x.id !== q.id))}
                className="mt-1.5 rounded-full p-1.5 text-ink-muted hover:bg-paper-warm hover:text-ink"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={add} className="mt-3 flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a search"
            maxLength={300}
          />
          <Button type="submit" variant="outline" disabled={!draft.trim()}>
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        </form>
      </section>

      <section aria-label="Run" className="kami-sheet flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <span className="font-sans text-xs font-medium text-ink-soft">Depth</span>
            <Segmented
              label="Depth"
              size="sm"
              value={depth}
              onChange={setDepth}
              options={[
                { id: "quick", label: "Quick" },
                { id: "deep", label: "Deep" },
              ]}
            />
          </div>
          <div>
            <p className="font-sans text-xs font-medium text-ink-soft">Estimate</p>
            <p className="font-display text-lg text-ink">
              about {estimate.low}–{estimate.high} credits
              <span className="font-sans text-xs text-ink-muted"> · budget {estimate.budget}</span>
            </p>
          </div>
          <div>
            <p className="font-sans text-xs font-medium text-ink-soft">Your balance</p>
            <p className="font-display text-lg text-ink tabular-nums">{view.balance}</p>
          </div>
        </div>
        <p className="font-body text-xs text-ink-muted">
          A run sets its whole budget aside while it works and returns what it doesn't use.
        </p>
        {error ? (
          <p role="alert" className="font-body text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => act("start")} disabled={!!busy || short || !checked.length}>
            {busy === "start" ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="size-4" aria-hidden="true" />
            )}
            Run
          </Button>
          <Button variant="ghost" onClick={() => act("discard")} disabled={!!busy}>
            Discard plan
          </Button>
          {short ? (
            <span className="font-sans text-sm text-ink-soft">
              No research credits for this: it needs {estimate.budget}, you have {view.balance}.
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
