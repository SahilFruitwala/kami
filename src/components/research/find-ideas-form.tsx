import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Segmented } from "@/components/gloss/primitives.tsx";
import { useResearchTopics, useResearchRefresh } from "@/hooks/use-research.ts";
import { researchApi, type DraftRunInput } from "@/lib/api/research.ts";
import { errorMessage } from "@/lib/errors";
import type { Depth } from "@/lib/research/kinds.ts";
import { cn } from "@/lib/utils.ts";

const sites = (text: string) =>
  text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

const FIELD = "font-sans text-xs font-medium text-ink-soft";

/**
 * Find ideas: a seed, optional filters, a topic and a depth. Drafting the
 * plan is free; the run page then shows the plan to check before anything
 * is spent. "Skip review" starts the drafted plan straight away.
 */
export function FindIdeasForm({
  topicId: fixedTopic,
  kind = "discover",
}: {
  topicId?: string;
  kind?: "discover" | "question" | "explore";
}) {
  const asking = kind === "question";
  const mapping = kind === "explore";
  const navigate = useNavigate();
  const refresh = useResearchRefresh();
  const topics = useResearchTopics();
  const [seed, setSeed] = useState("");
  const [depth, setDepth] = useState<Depth>("quick");
  const [topicId, setTopicId] = useState(fixedTopic ?? "");
  const [skipReview, setSkipReview] = useState(false);
  const [more, setMore] = useState(false);
  const [audience, setAudience] = useState<"any" | "b2b" | "b2c">("any");
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [since, setSince] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (seed.trim().length < 3 || busy) return;
    setBusy(true);
    setError(null);
    const input: DraftRunInput = {
      kind,
      seed: seed.trim(),
      depth,
      topicId: topicId || undefined,
      audience: audience === "any" ? undefined : audience,
      includeSites: sites(include).length ? sites(include) : undefined,
      excludeSites: sites(exclude).length ? sites(exclude) : undefined,
      sinceMonths: since ? Number(since) : undefined,
    };
    try {
      const view = await researchApi.draft(input);
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
        <span className={FIELD}>
          {asking
            ? "What do you want to know?"
            : mapping
              ? "Which space should we map?"
              : "What space should we look into?"}
        </span>
        <Input
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder={
            asking
              ? "e.g. What do freelance designers use to chase late invoices, and do they like it?"
              : "e.g. invoicing for freelance designers"
          }
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

      <button
        type="button"
        aria-expanded={more}
        onClick={() => setMore((v) => !v)}
        className="flex w-fit items-center gap-1 font-sans text-xs text-hanko"
      >
        More options
        <ChevronDown className={cn("size-3.5 transition-transform", more && "rotate-180")} />
      </button>
      {more ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className={FIELD}>Audience</span>
            <Segmented
              label="Audience"
              size="sm"
              value={audience}
              onChange={setAudience}
              options={[
                { id: "any", label: "Any" },
                { id: "b2b", label: "Businesses" },
                { id: "b2c", label: "Consumers" },
              ]}
            />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Only from the last</span>
            <select
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="h-9 rounded-lg border border-line bg-surface px-3 font-sans text-sm text-ink"
            >
              <option value="">Any time</option>
              <option value="6">6 months</option>
              <option value="12">12 months</option>
              <option value="24">2 years</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Only these sites</span>
            <Input
              value={include}
              onChange={(e) => setInclude(e.target.value)}
              placeholder="g2.com, news.ycombinator.com"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Never these sites</span>
            <Input
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
              placeholder="medium.com"
            />
          </label>
        </div>
      ) : null}

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
            <Search className="size-4" aria-hidden="true" />
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
