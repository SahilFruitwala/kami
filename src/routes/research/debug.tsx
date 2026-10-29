import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, LoaderCircle, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Segmented } from "@/components/gloss/primitives.tsx";
import { StatePill } from "@/components/research/research-ui.tsx";
import { RunProgressPanel } from "@/components/research/run-progress.tsx";
import { useResearchTopics } from "@/hooks/use-research.ts";
import { cn } from "@/lib/utils.ts";
import type { Depth, PlanQuery } from "@/lib/research/kinds.ts";
import { researchDebugApi, type DebugOverview, type DebugRun } from "@/lib/api/research.ts";

/**
 * Operator-only Discover debug page (ticket 09): draft a plan, edit it,
 * start the run, watch it, and see everything it stored. Not linked from the
 * nav; the API answers 404 unless the caller's email is in
 * RESEARCH_DEBUG_EMAILS. Every run spends real Firecrawl and model credits.
 */

type DebugSearch = { run?: string };

export const Route = createFileRoute("/research/debug")({
  validateSearch: (search: Record<string, unknown>): DebugSearch => ({
    run: typeof search.run === "string" ? search.run : undefined,
  }),
  component: ResearchDebugPage,
});

const ACTIVE = new Set(["drafting", "queued", "running"]);
const list = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

type DiscoverForm = {
  seed: string;
  depth: Depth;
  topicId: string;
  sinceMonths: string;
  includeSites: string;
  excludeSites: string;
};

const FIELD = "font-sans text-xs font-medium text-ink-soft";

/**
 * Same shape as the product's Find ideas form, with the real numbers shown:
 * what each depth reads and what starting it reserves. Drafting spends one
 * writer-model call; the plan below it is where the credits are decided.
 */
function DiscoverRunForm({
  form,
  setForm,
  overview,
  busy,
  drafting,
  onDraft,
}: {
  form: DiscoverForm;
  setForm: (next: DiscoverForm) => void;
  overview: DebugOverview | null;
  busy: boolean;
  drafting: boolean;
  onDraft: () => void;
}) {
  const topics = useResearchTopics();
  const [more, setMore] = useState(false);
  const limits = overview?.limits[form.depth];
  const budget = overview?.budgets[form.depth];
  const filters = [form.sinceMonths, form.includeSites, form.excludeSites].filter(Boolean).length;

  return (
    <form
      className="kami-sheet flex flex-col gap-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && form.seed.trim().length >= 3) onDraft();
      }}
    >
      <div className="space-y-1">
        <h2 className="font-display text-lg text-ink">New Discover run</h2>
        <p className="font-body text-sm text-ink-soft">
          Describe a market or problem area. Discover searches the web for people complaining,
          asking and paying, then turns what it finds into product ideas.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={FIELD}>What space should we look into?</span>
        <Input
          value={form.seed}
          onChange={(e) => setForm({ ...form, seed: e.target.value })}
          placeholder="e.g. tools for indie podcasters"
          maxLength={200}
          minLength={3}
          required
        />
      </label>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <span className={FIELD}>Depth</span>
          <Segmented
            label="Depth"
            size="sm"
            value={form.depth}
            onChange={(depth) => setForm({ ...form, depth })}
            options={[
              { id: "quick", label: "Quick" },
              { id: "deep", label: "Deep" },
            ]}
          />
          <span className="max-w-64 font-body text-xs text-ink-muted">
            {limits
              ? `Up to ${limits.maxQueries} searches and ${limits.pagesToRead} pages read.`
              : "Quick for a first look, Deep for a wider sweep."}
          </span>
        </div>
        <label className="flex min-w-56 flex-col gap-1.5">
          <span className={FIELD}>Topic</span>
          <select
            value={form.topicId}
            onChange={(e) => setForm({ ...form, topicId: e.target.value })}
            className="h-9 rounded-lg border border-line bg-surface px-3 font-sans text-sm text-ink"
          >
            <option value="">New topic</option>
            {(topics.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <span className="font-body text-xs text-ink-muted">
            Pick one to add this run's ideas to it.
          </span>
        </label>
      </div>

      <button
        type="button"
        aria-expanded={more}
        onClick={() => setMore((v) => !v)}
        className="flex w-fit items-center gap-1 font-sans text-xs text-hanko"
      >
        {filters ? `Filters (${filters} set)` : "Filters"}
        <ChevronDown className={cn("size-3.5 transition-transform", more && "rotate-180")} />
      </button>
      {more ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Only from the last</span>
            <select
              value={form.sinceMonths}
              onChange={(e) => setForm({ ...form, sinceMonths: e.target.value })}
              className="h-9 rounded-lg border border-line bg-surface px-3 font-sans text-sm text-ink"
            >
              <option value="">Any time</option>
              <option value="6">6 months</option>
              <option value="12">12 months</option>
              <option value="24">2 years</option>
            </select>
          </label>
          <span aria-hidden="true" className="hidden sm:block" />
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Only these sites</span>
            <Input
              value={form.includeSites}
              onChange={(e) => setForm({ ...form, includeSites: e.target.value })}
              placeholder="reddit.com, news.ycombinator.com"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Never these sites</span>
            <Input
              value={form.excludeSites}
              onChange={(e) => setForm({ ...form, excludeSites: e.target.value })}
              placeholder="medium.com"
            />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || form.seed.trim().length < 3}>
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
          Draft a plan
        </Button>
        <span className="font-body text-xs text-ink-muted">
          {drafting
            ? "Drafting the plan: asking the writer model for searches. This usually takes 5–20 seconds."
            : "Drafting makes one writer-model call."}
          {budget ? ` Starting the run then reserves ${budget} credits.` : ""}
        </span>
      </div>
    </form>
  );
}

function ResearchDebugPage() {
  const navigate = Route.useNavigate();
  const { run: runId } = Route.useSearch();
  const [overview, setOverview] = useState<DebugOverview | null>(null);
  const [detail, setDetail] = useState<DebugRun | null>(null);
  const [plan, setPlan] = useState<PlanQuery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [form, setForm] = useState({
    seed: "",
    depth: "quick" as Depth,
    topicId: "",
    sinceMonths: "",
    includeSites: "",
    excludeSites: "",
  });

  const loadOverview = useCallback(() => {
    researchDebugApi
      .overview()
      .then(setOverview)
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(loadOverview, [loadOverview]);

  const loadRun = useCallback(async (id: string) => {
    const next = await researchDebugApi.run(id);
    setDetail(next);
    if (next.run.state === "awaiting_plan") setPlan((p) => (p.length ? p : next.run.plan));
    return next;
  }, []);

  // Load the run when it is picked.
  useEffect(() => {
    if (!runId) return;
    setPlan([]);
    loadRun(runId).catch((err: Error) => setError(err.message));
  }, [runId, loadRun]);

  // Poll while the run is working. This is keyed on the run's state, not just
  // its id: starting a drafted run keeps the same id, and polling that only
  // restarted on a new id never resumed, so progress stayed frozen until Stop.
  const working = detail ? ACTIVE.has(detail.run.state) : false;
  useEffect(() => {
    if (!runId || !working) return;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      loadRun(runId)
        .catch((err: Error) => setError(err.message))
        .finally(() => {
          inFlight = false;
        });
    }, 2000);
    return () => clearInterval(timer);
  }, [runId, working, loadRun]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const draft = () =>
    act(async () => {
      setDrafting(true);
      try {
        const { runId: id } = await researchDebugApi.draft({
          seed: form.seed,
          depth: form.depth,
          topicId: form.topicId || undefined,
          sinceMonths: form.sinceMonths ? Number(form.sinceMonths) : undefined,
          includeSites: form.includeSites ? list(form.includeSites) : undefined,
          excludeSites: form.excludeSites ? list(form.excludeSites) : undefined,
        });
        await navigate({ search: { run: id } });
        loadOverview();
      } finally {
        setDrafting(false);
      }
    });

  const start = () =>
    act(async () => {
      if (!runId || !detail) return;
      await researchDebugApi.start(runId, { depth: detail.run.depth, plan });
      await navigate({ search: { run: runId }, replace: true });
      await loadRun(runId);
      loadOverview();
    });

  const stop = () =>
    act(async () => {
      if (!runId) return;
      await researchDebugApi.stop(runId);
      await loadRun(runId);
    });

  const run = detail?.run;
  const budget = run && overview ? overview.budgets[run.depth] : null;

  return (
    <main className="mx-auto w-full max-w-[1100px] space-y-8 px-4 py-8 text-sm sm:px-8">
      <header className="space-y-1">
        <h1 className="font-display text-2xl text-ink">Research debug</h1>
        <p className="font-body text-ink-soft">
          Operator only. Every run spends real Firecrawl and model credits.
          {overview ? ` Balance: ${overview.balance} research credits.` : ""}
        </p>
        {error && <p className="text-destructive">{error}</p>}
      </header>

      <DiscoverRunForm
        form={form}
        setForm={setForm}
        overview={overview}
        busy={busy}
        drafting={drafting}
        onDraft={draft}
      />

      {run && (
        <section className="kami-sheet flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0 space-y-1">
              <h2 className="font-display text-lg break-words text-ink">{run.input.seed}</h2>
              <div className="flex flex-wrap items-center gap-2 font-sans text-xs text-ink-soft">
                <StatePill state={run.state} stopReason={run.stopReason} />
                <span>{run.depth === "deep" ? "Deep" : "Quick"}</span>
              </div>
            </div>
            <span className="font-mono text-xs text-ink-muted">
              topic {run.topicId} · run {run.id}
            </span>
          </div>
          {run.error && (
            <p role="alert" className="font-body text-sm text-destructive">
              {run.error}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
            {[
              ["Firecrawl credits", run.firecrawlCredits],
              ["Tokens in", run.tokensIn],
              ["Tokens out", run.tokensOut],
              ["Reserved", run.budgetCredits || budget],
              ["Charged", run.chargedCredits ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className={FIELD}>{label}</dt>
                <dd className="font-mono text-sm text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <details className="group">
            <summary className="w-fit cursor-pointer font-sans text-xs text-hanko">
              Progress details
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-paper-warm p-3 font-mono text-xs text-ink-soft">
              {JSON.stringify({ ...run.progress, picks: undefined, toRead: undefined }, null, 1)}
            </pre>
          </details>

          {run.state === "awaiting_plan" && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <div className="space-y-1">
                <h3 className="font-display text-base text-ink">Check the plan</h3>
                <p className="font-body text-sm text-ink-soft">
                  Untick a search to skip it, or edit its wording. Nothing is spent until you start.
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                {plan.map((q, i) => (
                  <li key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <input
                      type="checkbox"
                      aria-label={`Run search ${i + 1}`}
                      checked={q.checked}
                      onChange={(e) =>
                        setPlan(
                          plan.map((p, j) => (j === i ? { ...p, checked: e.target.checked } : p)),
                        )
                      }
                      className="size-4 accent-persimmon"
                    />
                    <Input
                      aria-label={`Search ${i + 1}`}
                      className={cn("min-w-48 flex-1", !q.checked && "opacity-50")}
                      value={q.query}
                      onChange={(e) =>
                        setPlan(plan.map((p, j) => (j === i ? { ...p, query: e.target.value } : p)))
                      }
                    />
                    <span className="w-44 truncate font-sans text-xs text-ink-muted">
                      {q.site ?? "Web"} · {q.intent}
                      {q.repeat ? " · repeat" : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={busy} onClick={start}>
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="size-4" aria-hidden="true" />
                  )}
                  Start run
                </Button>
                <span className="font-body text-xs text-ink-muted">
                  {plan.filter((q) => q.checked).length} searches.
                  {budget ? ` Reserves ${budget} credits.` : ""}
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {run && run.state !== "awaiting_plan" && run.state !== "drafting" && (
        <RunProgressPanel
          run={run}
          ideasCount={detail?.ideas.length}
          onStop={stop}
          stopDisabled={busy}
        />
      )}

      {detail && (
        <>
          <DebugList title={`Ideas (${detail.ideas.length})`}>
            {detail.ideas.map((idea) => (
              <li key={idea.id}>
                <strong>{idea.title}</strong> {idea.isNew ? "· new" : ""}
                {idea.addedLastRun ? ` · +${idea.addedLastRun}` : ""} · {idea.status} ·{" "}
                {idea.evidenceCount} quotes
                <div className="text-ink-soft">{idea.summary}</div>
                <div className="font-mono text-xs text-ink-muted">{JSON.stringify(idea.score)}</div>
              </li>
            ))}
          </DebugList>
          <DebugList title={`Evidence (${detail.evidence.length})`}>
            {detail.evidence.map((e) => (
              <li key={e.id}>
                “{e.quote}”
                <div className="font-mono text-xs text-ink-muted">
                  {e.kind} · {e.match} · sentiment {e.sentiment}
                  {e.strong ? " · strong" : ""}
                  {e.pays ? " · pays" : ""}
                  {e.names.length ? ` · ${e.names.join(", ")}` : ""}
                  {e.hasAuthor ? " · author" : ""} · {e.source}
                  {e.ideaId ? "" : " · unmatched"}
                </div>
              </li>
            ))}
          </DebugList>
          <DebugList title={`Sources read (${detail.sources.length})`}>
            {detail.sources.map((s) => (
              <li key={s.id}>
                <a
                  className="text-hanko underline-offset-4 hover:underline"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {s.title || s.url}
                </a>{" "}
                <span className="font-mono text-xs text-ink-muted">
                  {s.site} · {s.kind} · {s.chars} chars
                </span>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl bg-paper-warm p-2 text-xs">
                  {s.preview}
                </pre>
              </li>
            ))}
          </DebugList>
          <DebugList title={`To read (${detail.run.progress.toRead?.length ?? 0})`}>
            {(detail.run.progress.toRead ?? []).map((url) => (
              <li key={url} className="font-mono text-xs">
                {url}
                {detail.run.progress.skippedUrls?.includes(url) ? " · skipped" : ""}
              </li>
            ))}
          </DebugList>
          <DebugList title={`Searches (${detail.queries.length})`}>
            {detail.queries.map((q) => (
              <li key={q.query}>
                <span className="font-mono">{q.query}</span> · {q.hits.length} results
                <ul className="ml-4 text-xs text-ink-muted">
                  {q.hits.map((h) => (
                    <li key={h.url}>
                      {h.title} — {h.url}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </DebugList>
        </>
      )}

      {overview && (
        <DebugList title="Recent runs">
          {overview.runs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="text-hanko underline-offset-4 hover:underline"
                onClick={() => void navigate({ search: { run: r.id } })}
              >
                {r.seed}
              </button>{" "}
              <span className="font-mono text-xs text-ink-muted">
                {r.depth} · {r.state} · {new Date(r.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </DebugList>
      )}
    </main>
  );
}

function DebugList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg text-ink">{title}</h2>
      <ul className="space-y-3 font-body text-ink">{children}</ul>
    </section>
  );
}
