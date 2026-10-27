import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
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

function ResearchDebugPage() {
  const navigate = Route.useNavigate();
  const { run: runId } = Route.useSearch();
  const [overview, setOverview] = useState<DebugOverview | null>(null);
  const [detail, setDetail] = useState<DebugRun | null>(null);
  const [plan, setPlan] = useState<PlanQuery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  // Poll while the run is working.
  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const next = await loadRun(runId);
        if (!stopped && ACTIVE.has(next.run.state)) timer = setTimeout(tick, 2000);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    setPlan([]);
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [runId, loadRun]);

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
        <h1 className="font-serif text-2xl">Research debug</h1>
        <p className="text-muted-foreground">
          Operator only. Every run spends real Firecrawl and model credits.
          {overview ? ` Balance: ${overview.balance} research credits.` : ""}
        </p>
        {error && <p className="text-destructive">{error}</p>}
      </header>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="font-medium">New Discover run</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Seed, e.g. tools for indie podcasters"
            value={form.seed}
            onChange={(e) => setForm({ ...form, seed: e.target.value })}
          />
          <div className="flex gap-2">
            <select
              className="rounded-md border border-border bg-card px-2"
              value={form.depth}
              onChange={(e) => setForm({ ...form, depth: e.target.value as Depth })}
            >
              <option value="quick">Quick</option>
              <option value="deep">Deep</option>
            </select>
            <Input
              placeholder="Since months (optional)"
              value={form.sinceMonths}
              onChange={(e) => setForm({ ...form, sinceMonths: e.target.value })}
            />
          </div>
          <Input
            placeholder="Only sites, comma-separated (optional)"
            value={form.includeSites}
            onChange={(e) => setForm({ ...form, includeSites: e.target.value })}
          />
          <Input
            placeholder="Never sites, comma-separated (optional)"
            value={form.excludeSites}
            onChange={(e) => setForm({ ...form, excludeSites: e.target.value })}
          />
          <Input
            placeholder="Existing topic id (optional; blank makes a new topic)"
            value={form.topicId}
            onChange={(e) => setForm({ ...form, topicId: e.target.value })}
          />
        </div>
        <Button disabled={busy || form.seed.trim().length < 3} onClick={draft}>
          Draft plan (one writer-model call)
        </Button>
      </section>

      {run && (
        <section className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">
              {run.input.seed} · {run.depth} · <span className="font-mono">{run.state}</span>
              {run.stopReason ? ` (${run.stopReason})` : ""}
              {run.step ? ` · step ${run.step}` : ""}
            </h2>
            <span className="font-mono text-xs text-muted-foreground">
              topic {run.topicId} · run {run.id}
            </span>
          </div>
          {run.error && <p className="text-destructive">{run.error}</p>}
          <p className="font-mono text-xs">
            spend: firecrawl {run.firecrawlCredits} · tokens {run.tokensIn} in / {run.tokensOut} out
            · budget {run.budgetCredits || budget} · charged {run.chargedCredits ?? "—"}
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">
            {JSON.stringify({ ...run.progress, picks: undefined, toRead: undefined }, null, 1)}
          </pre>

          {run.state === "awaiting_plan" && (
            <div className="space-y-2">
              <h3 className="font-medium">Plan</h3>
              {plan.map((q, i) => (
                <label key={q.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={q.checked}
                    onChange={(e) =>
                      setPlan(
                        plan.map((p, j) => (j === i ? { ...p, checked: e.target.checked } : p)),
                      )
                    }
                  />
                  <Input
                    className="flex-1"
                    value={q.query}
                    onChange={(e) =>
                      setPlan(plan.map((p, j) => (j === i ? { ...p, query: e.target.value } : p)))
                    }
                  />
                  <span className="w-48 truncate font-mono text-xs text-muted-foreground">
                    {q.site ?? "web"} · {q.intent}
                    {q.repeat ? " · repeat" : ""}
                  </span>
                </label>
              ))}
              <Button disabled={busy} onClick={start}>
                Start ({plan.filter((q) => q.checked).length} searches, reserves {budget} credits)
              </Button>
            </div>
          )}
          {ACTIVE.has(run.state) && run.state !== "drafting" && (
            <Button variant="outline" disabled={busy} onClick={stop}>
              Stop
            </Button>
          )}
        </section>
      )}

      {detail && (
        <>
          <DebugList title={`Ideas (${detail.ideas.length})`}>
            {detail.ideas.map((idea) => (
              <li key={idea.id}>
                <strong>{idea.title}</strong> {idea.isNew ? "· new" : ""}
                {idea.addedLastRun ? ` · +${idea.addedLastRun}` : ""} · {idea.status} ·{" "}
                {idea.evidenceCount} quotes
                <div className="text-muted-foreground">{idea.summary}</div>
                <div className="font-mono text-xs">{JSON.stringify(idea.score)}</div>
              </li>
            ))}
          </DebugList>
          <DebugList title={`Evidence (${detail.evidence.length})`}>
            {detail.evidence.map((e) => (
              <li key={e.id}>
                “{e.quote}”
                <div className="font-mono text-xs text-muted-foreground">
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
                <a className="underline" href={s.url} target="_blank" rel="noreferrer">
                  {s.title || s.url}
                </a>{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {s.site} · {s.kind} · {s.chars} chars
                </span>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
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
                <ul className="ml-4 text-xs text-muted-foreground">
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
                className="underline"
                onClick={() => void navigate({ search: { run: r.id } })}
              >
                {r.seed}
              </button>{" "}
              <span className="font-mono text-xs text-muted-foreground">
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
      <h2 className="font-medium">{title}</h2>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}
