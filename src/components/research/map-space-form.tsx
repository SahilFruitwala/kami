import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Compass, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Segmented } from "@/components/gloss/primitives.tsx";
import { useResearchTopics, useResearchRefresh } from "@/hooks/use-research.ts";
import { researchApi } from "@/lib/api/research.ts";
import { errorMessage } from "@/lib/errors";
import type { Depth } from "@/lib/research/kinds.ts";

const FIELD = "font-sans text-xs font-medium text-ink-soft";

/**
 * Map a space: a seed, a topic and a depth. Drafting the plan is free; the
 * run page then shows the searches before anything is spent.
 */
export function MapSpaceForm({ topicId: fixedTopic }: { topicId?: string }) {
  const navigate = useNavigate();
  const refresh = useResearchRefresh();
  const topics = useResearchTopics();
  const [seed, setSeed] = useState("");
  const [depth, setDepth] = useState<Depth>("quick");
  const [topicId, setTopicId] = useState(fixedTopic ?? "");
  const [skipReview, setSkipReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (seed.trim().length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const view = await researchApi.draft({
        kind: "explore",
        seed: seed.trim(),
        depth,
        topicId: topicId || undefined,
      });
      if (skipReview) await researchApi.start(view.run.id, { depth, plan: view.run.plan });
      refresh();
      void navigate({ to: "/research/runs/$runId", params: { runId: view.run.id } });
    } catch (err) {
      setError(errorMessage(err, "Couldn't draft a plan. Try again in a moment."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className={FIELD}>Which space should we map?</span>
        <Input
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="e.g. podcast editing tools"
          maxLength={200}
          required
          minLength={3}
        />
      </label>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <span className={FIELD}>Depth</span>
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
        {fixedTopic ? null : (
          <label className="flex min-w-48 flex-col gap-1.5">
            <span className={FIELD}>Topic</span>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="h-9 rounded-lg border border-line bg-surface px-3 font-sans text-sm text-ink"
            >
              <option value="">New topic</option>
              {(topics.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex h-9 items-center gap-2 font-sans text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={skipReview}
            onChange={(e) => setSkipReview(e.target.checked)}
            className="size-4 accent-persimmon"
          />
          Skip review
        </label>
      </div>

      {error ? (
        <p role="alert" className="font-body text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || seed.trim().length < 3}>
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Compass className="size-4" aria-hidden="true" />
          )}
          {skipReview ? "Plan and run" : "Draft a plan"}
        </Button>
        <span className="font-body text-xs text-ink-muted">
          {skipReview
            ? "The run starts as soon as the plan is drafted."
            : "Drafting is free. You'll see the searches and the cost before anything runs."}
        </span>
      </div>
    </form>
  );
}
