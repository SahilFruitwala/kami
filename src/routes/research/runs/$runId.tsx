import { createFileRoute, Link } from "@tanstack/react-router";
import { addTransitionType, startTransition, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { IdeaCard } from "@/components/research/idea-card.tsx";
import { PlanEditor } from "@/components/research/plan-editor.tsx";
import { RunProgressPanel } from "@/components/research/run-progress.tsx";
import { EmptyNote, StatePill } from "@/components/research/research-ui.tsx";
import { useResearchRun, useResearchRefresh } from "@/hooks/use-research.ts";
import { researchApi, type RunView } from "@/lib/api/research.ts";
import { toastError } from "@/lib/errors";
import type { LibraryItem } from "@/lib/library-item.ts";

export const Route = createFileRoute("/research/runs/$runId")({
  component: RunPage,
});

/**
 * One run: the plan screen while it awaits its plan, then live progress
 * (polled every 2 s), the ideas it has made so far, Stop, and at the end
 * what it spent.
 */
function RunPage() {
  const { runId } = Route.useParams();
  const navigate = Route.useNavigate();
  const query = useResearchRun(runId);

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  const view = query.data;
  return (
    <AppShell active="research" onOpenItem={openItem}>
      <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 pt-8 pb-10 sm:px-8">
        {view ? (
          <Link
            to="/research/$topicId"
            params={{ topicId: view.run.topicId }}
            className="flex w-fit items-center gap-1.5 font-sans text-sm text-ink-soft hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {view.run.topicName || "Topic"}
          </Link>
        ) : null}
        {query.isPending ? (
          <div className="kami-sheet h-48 animate-pulse opacity-60" aria-hidden="true" />
        ) : query.isError ? (
          <EmptyNote>Couldn't find that run.</EmptyNote>
        ) : view ? (
          <RunBody view={view} />
        ) : null}
      </div>
    </AppShell>
  );
}

function RunBody({ view }: { view: RunView }) {
  const { run } = view;
  const title = run.input.link ? "Reading a link" : run.input.seed;
  const isReport = run.kind === "validate" || run.kind === "question";
  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatePill
            state={run.state}
            stopReason={run.stopReason}
            started={run.state !== "stopped" || run.startedAt !== null}
          />
          <span className="font-sans text-xs text-ink-muted">
            {run.input.link
              ? "Pasted link"
              : `${run.kind === "validate" ? "Validation · " : run.kind === "question" ? "Question · " : run.kind === "explore" ? "Map · " : ""}${run.depth === "deep" ? "Deep" : "Quick"}`}
          </span>
        </div>
        <h1 className="font-display text-3xl leading-tight text-ink break-words">{title}</h1>
        {run.input.link ? (
          <a
            href={run.input.link}
            target="_blank"
            rel="noreferrer"
            className="font-sans text-sm break-all text-hanko underline-offset-4 hover:underline"
          >
            {run.input.link}
          </a>
        ) : null}
      </header>

      {run.state === "awaiting_plan" ? (
        <PlanEditor view={view} />
      ) : run.state === "drafting" ? (
        <EmptyNote>Drafting the plan…</EmptyNote>
      ) : run.state === "stopped" && run.startedAt === null ? (
        <EmptyNote>This plan was discarded before it ran. Nothing was spent.</EmptyNote>
      ) : (
        <>
          <EndNote view={view} />
          <Progress view={view} />
          {isReport ? (
            <ReportLink view={view} />
          ) : run.kind === "explore" ? (
            <PlayersLink view={view} />
          ) : (
            <Ideas view={view} />
          )}
          {run.chargedCredits !== null ? <Spend view={view} /> : null}
        </>
      )}
    </>
  );
}

/** Why a run ended the way it did, above its results. */
function EndNote({ view }: { view: RunView }) {
  const { run, ideas } = view;
  if (run.state === "failed") {
    return (
      <p role="alert" className="kami-sheet p-4 font-body text-sm text-destructive">
        This run stopped with an error: {run.error ?? "something went wrong"}. You were only charged
        for what it used.
      </p>
    );
  }
  if (run.state === "stopped" && run.stopReason === "budget") {
    return (
      <EmptyNote>
        This run reached its budget and stopped early. It kept and scored everything it found before
        then.
      </EmptyNote>
    );
  }
  if (run.state === "stopped" && run.stopReason === "user") {
    return <EmptyNote>You stopped this run. It kept and scored what it had found.</EmptyNote>;
  }
  if (run.state === "done" && !ideas.length && run.kind === "discover") {
    const searched = run.plan.filter((q) => q.checked !== false).map((q) => q.query);
    return (
      <EmptyNote>
        This run didn't find anything new.{" "}
        {run.input.link
          ? "The page had no quotes about problems in this topic, or the topic already had them."
          : `It searched for: ${searched.join("; ")}.`}
      </EmptyNote>
    );
  }
  return null;
}

function Progress({ view }: { view: RunView }) {
  const refresh = useResearchRefresh();
  const [stopping, setStopping] = useState(false);
  const { run } = view;

  async function stop() {
    setStopping(true);
    try {
      await researchApi.stop(run.id);
      refresh();
    } catch (err) {
      toastError(err, "Couldn't stop the run.");
      setStopping(false);
    }
  }

  return (
    <RunProgressPanel
      run={run}
      ideasCount={view.ideas.length}
      reportDone={Boolean(view.reportId)}
      onStop={stop}
      stopDisabled={stopping}
    />
  );
}

/** Where a finished Validate or question run's report is. */
function ReportLink({ view }: { view: RunView }) {
  if (!view.reportId) return null;
  return (
    <section
      aria-label="Report"
      className="kami-sheet flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6"
    >
      <h2 className="font-display text-xl text-ink">The report is ready</h2>
      <Button asChild size="sm">
        <Link to="/research/reports/$reportId" params={{ reportId: view.reportId }}>
          Read the report
        </Link>
      </Button>
    </section>
  );
}

/** Where an Explore run's products are. */
function PlayersLink({ view }: { view: RunView }) {
  const { run } = view;
  if (run.state === "queued" || run.state === "running") return null;
  return (
    <section
      aria-label="Players"
      className="kami-sheet flex flex-wrap items-center justify-between gap-3 p-4 sm:p-6"
    >
      <h2 className="font-display text-xl text-ink">
        {run.progress.playersNew ?? 0} new products noted
      </h2>
      <Button asChild size="sm">
        <Link to="/research/$topicId" params={{ topicId: run.topicId }} search={{ tab: "players" }}>
          See the players
        </Link>
      </Button>
    </section>
  );
}

function Ideas({ view }: { view: RunView }) {
  if (!view.ideas.length) return null;
  return (
    <section aria-label="Ideas" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl text-ink">Ideas from this run</h2>
        <Link
          to="/research/$topicId"
          params={{ topicId: view.run.topicId }}
          className="font-sans text-sm text-hanko underline-offset-4 hover:underline"
        >
          All ideas in this topic
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {view.ideas.map((idea) => (
          <li key={idea.id} className="list-none">
            <IdeaCard idea={idea} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Spend({ view }: { view: RunView }) {
  const { run } = view;
  const parts = [
    { label: "Charged", value: `${run.chargedCredits} credits` },
    { label: "Page reads and searches", value: `${run.firecrawlCredits} credits` },
    {
      label: "Model tokens",
      value: `${run.tokensIn.toLocaleString()} in · ${run.tokensOut.toLocaleString()} out`,
    },
    { label: "Budget", value: `${run.budgetCredits} credits` },
  ];
  return (
    <section aria-label="Spend" className="kami-sheet p-4 sm:p-6">
      <h2 className="font-display text-xl text-ink">What it spent</h2>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {parts.map((p) => (
          <div key={p.label}>
            <dt className="font-sans text-xs text-ink-muted">{p.label}</dt>
            <dd className="font-sans text-sm text-ink tabular-nums">{p.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
