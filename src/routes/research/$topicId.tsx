import { createFileRoute, Link } from "@tanstack/react-router";
import { addTransitionType, startTransition, useState } from "react";
import {
  ArrowLeft,
  Link2,
  LoaderCircle,
  Merge,
  Pencil,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Segmented } from "@/components/gloss/primitives.tsx";
import { AskQuestionForm } from "@/components/research/ask-question-form.tsx";
import { FindIdeasForm } from "@/components/research/find-ideas-form.tsx";
import { IdeaCard } from "@/components/research/idea-card.tsx";
import { IdeaDetailSheet } from "@/components/research/idea-detail.tsx";
import { relativeDay } from "@/components/research/research-format.ts";
import { EmptyNote, ResearchUnavailable, StatePill } from "@/components/research/research-ui.tsx";
import {
  useResearchStatus,
  useResearchTopic,
  useTopicIdeas,
  useTopicSources,
  useTopicReports,
  useResearchRefresh,
} from "@/hooks/use-research.ts";
import { researchApi, type IdeaCard as Idea, type RunSummary } from "@/lib/api/research.ts";
import { confirmAction } from "@/lib/confirm.ts";
import { errorMessage, toastError } from "@/lib/errors";
import type { LibraryItem } from "@/lib/library-item.ts";

type Tab = "ideas" | "sources" | "runs" | "reports";

export const Route = createFileRoute("/research/$topicId")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab:
      search.tab === "sources" || search.tab === "runs" || search.tab === "reports"
        ? search.tab
        : undefined,
  }),
  component: TopicPage,
});

/** A topic: its ideas, the pages it read, its runs, and a field to paste a link. */
function TopicPage() {
  const { topicId } = Route.useParams();
  const { tab = "ideas" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const status = useResearchStatus();
  const topic = useResearchTopic(topicId);

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  return (
    <AppShell active="research" onOpenItem={openItem}>
      {status.data && !status.data.enabled ? (
        <ResearchUnavailable />
      ) : (
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-8 pb-10 sm:px-8">
          <Link
            to="/research"
            className="flex w-fit items-center gap-1.5 font-sans text-sm text-ink-soft hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Research
          </Link>
          {topic.isPending ? (
            <div className="kami-sheet h-40 animate-pulse opacity-60" aria-hidden="true" />
          ) : topic.isError ? (
            <EmptyNote>This topic doesn't exist, or it isn't yours.</EmptyNote>
          ) : (
            <>
              <TopicHeader topicId={topicId} name={topic.data.topic.name} />
              <TopicActions topicId={topicId} />
              <Segmented
                label="Topic sections"
                value={tab}
                onChange={(next) =>
                  void navigate({
                    search: { tab: next === "ideas" ? undefined : next },
                    replace: true,
                  })
                }
                options={[
                  { id: "ideas", label: "Ideas" },
                  { id: "sources", label: "Sources" },
                  { id: "runs", label: "Runs" },
                  { id: "reports", label: "Reports" },
                ]}
              />
              {tab === "ideas" ? <IdeasTab topicId={topicId} /> : null}
              {tab === "sources" ? <SourcesTab topicId={topicId} /> : null}
              {tab === "runs" ? <RunsTab runs={topic.data.runs} /> : null}
              {tab === "reports" ? <ReportsTab topicId={topicId} /> : null}
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}

function TopicHeader({ topicId, name }: { topicId: string; name: string }) {
  const refresh = useResearchRefresh();
  const navigate = Route.useNavigate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    try {
      await researchApi.renameTopic(topicId, draft.trim());
      setEditing(false);
      refresh();
    } catch (err) {
      toastError(err, "Couldn't rename the topic.");
    }
  }

  async function remove() {
    const ok = await confirmAction({
      title: "Delete this topic?",
      description:
        "Its runs, quotes and ideas are deleted. Pages it read stay cached for your other topics.",
      confirmLabel: "Delete topic",
    });
    if (!ok) return;
    try {
      await researchApi.deleteTopic(topicId);
      refresh();
      void navigate({ to: "/research" });
    } catch (err) {
      toastError(err, "Couldn't delete the topic.");
    }
  }

  if (editing) {
    return (
      <form onSubmit={rename} className="flex flex-wrap items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={80}
          aria-label="Topic name"
          className="max-w-md"
          autoFocus
        />
        <Button type="submit" size="sm" disabled={!draft.trim()}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h1 className="g-h1 min-w-0 break-words text-ink">{name}</h1>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Rename topic"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Delete topic" onClick={remove}>
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** Find more ideas in this topic, or paste a link to read one page into it. */
function TopicActions({ topicId }: { topicId: string }) {
  const refresh = useResearchRefresh();
  const navigate = Route.useNavigate();
  const [finding, setFinding] = useState(false);
  const [asking, setAsking] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function paste(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { runId } = await researchApi.pasteLink(topicId, url.trim());
      refresh();
      void navigate({ to: "/research/runs/$runId", params: { runId } });
    } catch (err) {
      setError(errorMessage(err, "Couldn't read that link."));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <Button
          variant={finding ? "secondary" : "default"}
          onClick={() => {
            setFinding((v) => !v);
            setAsking(false);
          }}
          aria-expanded={finding}
        >
          <Search className="size-4" aria-hidden="true" />
          Find more ideas
        </Button>
        <Button
          variant={asking ? "secondary" : "outline"}
          onClick={() => {
            setAsking((v) => !v);
            setFinding(false);
          }}
          aria-expanded={asking}
        >
          Ask a question
        </Button>
        <form onSubmit={paste} className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a link to a discussion or review page"
              aria-label="Paste a link"
              maxLength={2000}
            />
            <Button type="submit" variant="outline" disabled={busy || !url.trim()}>
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Link2 className="size-4" aria-hidden="true" />
              )}
              Read
            </Button>
          </div>
          <span className="font-sans text-[11px] text-ink-muted">
            Reads one page into this topic for up to 5 credits. A page the topic already has is
            free.
          </span>
          {error ? (
            <span role="alert" className="font-body text-sm text-destructive">
              {error}
            </span>
          ) : null}
        </form>
      </div>
      {finding ? (
        <section aria-label="Find more ideas" className="kami-sheet p-4 sm:p-6">
          <FindIdeasForm topicId={topicId} />
        </section>
      ) : null}
      {asking ? (
        <section aria-label="Ask a question" className="kami-sheet p-4 sm:p-6">
          <AskQuestionForm topicId={topicId} />
        </section>
      ) : null}
    </div>
  );
}

type IdeaFilter = "live" | "starred" | "dismissed";

async function startValidate(
  ideaId: string,
  navigate: ReturnType<typeof Route.useNavigate>,
) {
  const view = await researchApi.draft({ kind: "validate", ideaId, depth: "quick" });
  startTransition(() => {
    addTransitionType("nav-forward");
    void navigate({ to: "/research/runs/$runId", params: { runId: view.run.id } });
  });
}

function IdeasTab({ topicId }: { topicId: string }) {
  const refresh = useResearchRefresh();
  const navigate = Route.useNavigate();
  const [filter, setFilter] = useState<IdeaFilter>("live");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const ideas = useTopicIdeas(topicId, filter);

  async function validate(ideaId: string) {
    setValidating(ideaId);
    try {
      await startValidate(ideaId, navigate);
    } catch (err) {
      toastError(err, "Couldn't start a Validate run.");
      setValidating(null);
    }
  }

  async function setStatus(idea: Idea, status: "open" | "starred" | "dismissed") {
    try {
      await researchApi.updateIdea(idea.id, { status });
      refresh();
    } catch (err) {
      toastError(err, "Couldn't update that idea.");
    }
  }

  async function merge() {
    const list = ideas.data ?? [];
    const chosen = list.filter((i) => selected.includes(i.id));
    if (chosen.length < 2) return;
    // Keep the best-scored one; the rest fold into it.
    const [into, ...rest] = chosen;
    const ok = await confirmAction({
      title: `Merge ${chosen.length} ideas?`,
      description: `Their quotes move into “${into.title}” and it's rescored. The others are marked merged.`,
      confirmLabel: "Merge",
      destructive: false,
    });
    if (!ok) return;
    setMerging(true);
    try {
      await researchApi.mergeIdeas(
        into.id,
        rest.map((i) => i.id),
      );
      setSelected([]);
      refresh();
    } catch (err) {
      toastError(err, "Couldn't merge those ideas.");
    } finally {
      setMerging(false);
    }
  }

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <section aria-label="Ideas" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Which ideas"
          size="sm"
          value={filter}
          onChange={(f) => {
            setFilter(f);
            setSelected([]);
          }}
          options={[
            { id: "live", label: "Open" },
            { id: "starred", label: "Starred" },
            { id: "dismissed", label: "Dismissed" },
          ]}
        />
        {!selected.length && filter !== "dismissed" && (ideas.data?.length ?? 0) > 1 ? (
          <span className="font-sans text-xs text-ink-muted">Select ideas to merge them.</span>
        ) : null}
      </div>
      {selected.length ? (
        // Floats above the phone tab bar, so Merge stays in reach on long lists.
        <div
          role="toolbar"
          aria-label="Selected ideas"
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6"
        >
          <div className="flex items-center gap-2 rounded-full bg-surface px-3 py-2 shadow-[var(--shadow-raised)]">
            <span className="px-1 font-sans text-xs text-ink-soft">{selected.length} selected</span>
            <Button size="sm" onClick={merge} disabled={selected.length < 2 || merging}>
              <Merge className="size-3.5" aria-hidden="true" />
              Merge
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {ideas.isPending ? (
        <div className="kami-sheet h-40 animate-pulse opacity-60" aria-hidden="true" />
      ) : ideas.isError ? (
        <EmptyNote>Couldn't load the ideas. Try again in a moment.</EmptyNote>
      ) : !ideas.data.length ? (
        <EmptyNote>
          {filter === "live"
            ? "No ideas yet. Find ideas or paste a link to start."
            : filter === "starred"
              ? "Nothing starred yet."
              : "Nothing dismissed."}
        </EmptyNote>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ideas.data.map((idea) => (
            <li key={idea.id} className="list-none">
              <IdeaCard
                idea={idea}
                onOpen={() => setOpenId(idea.id)}
                selector={
                  filter !== "dismissed" ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${idea.title}`}
                      checked={selected.includes(idea.id)}
                      onChange={() => toggle(idea.id)}
                      className="mt-1.5 size-4 shrink-0 accent-persimmon"
                    />
                  ) : undefined
                }
                actions={
                  idea.status === "dismissed" ? (
                    <Button size="xs" variant="ghost" onClick={() => setStatus(idea, "open")}>
                      Reopen
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="xs"
                        variant="ghost"
                        aria-label="Validate this idea"
                        disabled={validating === idea.id}
                        onClick={() => void validate(idea.id)}
                      >
                        {validating === idea.id ? (
                          <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <ShieldCheck className="size-3" aria-hidden="true" />
                        )}
                        Validate
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={idea.status === "starred" ? "Unstar" : "Star"}
                        aria-pressed={idea.status === "starred"}
                        onClick={() =>
                          setStatus(idea, idea.status === "starred" ? "open" : "starred")
                        }
                      >
                        <Star
                          className={
                            idea.status === "starred" ? "fill-hanko text-hanko" : undefined
                          }
                          aria-hidden="true"
                        />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Dismiss"
                        onClick={() => setStatus(idea, "dismissed")}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </>
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
      <IdeaDetailSheet
        ideaId={openId}
        onClose={() => setOpenId(null)}
        onValidate={(id) => void validate(id)}
      />
    </section>
  );
}

const KIND_LABEL: Record<string, string> = {
  thread: "Discussion",
  review: "Review",
  pricing: "Pricing",
  homepage: "Homepage",
  article: "Article",
  other: "Page",
};

function SourcesTab({ topicId }: { topicId: string }) {
  const sources = useTopicSources(topicId);
  if (sources.isPending) {
    return <div className="kami-sheet h-40 animate-pulse opacity-60" aria-hidden="true" />;
  }
  if (sources.isError) return <EmptyNote>Couldn't load the sources.</EmptyNote>;
  if (!sources.data.length) return <EmptyNote>No pages read in this topic yet.</EmptyNote>;
  return (
    <ul className="kami-sheet divide-y divide-line">
      {sources.data.map((s) => (
        <li key={s.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-baseline sm:gap-4">
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 font-body text-sm break-words text-ink hover:text-hanko"
          >
            {s.title || s.url}
          </a>
          <span className="flex shrink-0 flex-wrap gap-x-3 font-sans text-[11px] text-ink-muted">
            <span>{s.site}</span>
            <span>{KIND_LABEL[s.kind] ?? s.kind}</span>
            {s.addedBy === "link" ? <span>Pasted</span> : null}
            <span>Read {relativeDay(s.fetchedAt)}</span>
            <span>
              {s.evidenceCount} {s.evidenceCount === 1 ? "quote" : "quotes"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReportsTab({ topicId }: { topicId: string }) {
  const reports = useTopicReports(topicId);
  if (reports.isPending) {
    return <div className="kami-sheet h-40 animate-pulse opacity-60" aria-hidden="true" />;
  }
  if (reports.isError) return <EmptyNote>Couldn't load the reports.</EmptyNote>;
  if (!reports.data.length) {
    return (
      <EmptyNote>
        No reports yet. Validate an idea or ask a question to write a cited report.
      </EmptyNote>
    );
  }
  return (
    <ul className="kami-sheet divide-y divide-line">
      {reports.data.map((r) => (
        <li key={r.id}>
          <Link
            to="/research/reports/$reportId"
            params={{ reportId: r.id }}
            className="flex flex-col gap-1 p-4 transition-colors hover:bg-paper-warm sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="min-w-0 flex-1 font-body text-sm break-words text-ink">
              {r.kind === "question" ? r.question || "Question" : r.ideaTitle || "Validate"}
            </span>
            <span className="flex shrink-0 flex-wrap gap-x-3 font-sans text-[11px] text-ink-muted">
              <span>{r.kind === "question" ? "Question" : "Validate"}</span>
              <span>{relativeDay(r.createdAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RunsTab({ runs }: { runs: RunSummary[] }) {
  if (!runs.length) return <EmptyNote>No runs yet.</EmptyNote>;
  return (
    <ul className="kami-sheet divide-y divide-line">
      {runs.map((r) => (
        <li key={r.id}>
          <Link
            to="/research/runs/$runId"
            params={{ runId: r.id }}
            className="flex flex-col gap-1 p-4 transition-colors hover:bg-paper-warm sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="min-w-0 flex-1 font-body text-sm break-words text-ink">
              {r.kind === "validate"
                ? `Validate: ${r.seed}`
                : r.kind === "question"
                  ? r.seed
                  : r.addedBy === "link"
                    ? "Pasted link"
                    : r.seed}
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[11px] text-ink-muted">
              <StatePill state={r.state} stopReason={r.stopReason} started={r.started} />
              {r.addedBy === "plan" ? <span>{r.depth === "deep" ? "Deep" : "Quick"}</span> : null}
              {r.kind === "validate" || r.kind === "question" ? (
                <span>Report</span>
              ) : (
                <span>
                  {r.ideasNew} new {r.ideasNew === 1 ? "idea" : "ideas"}
                </span>
              )}
              <span>{r.chargedCredits === null ? "—" : `${r.chargedCredits} credits`}</span>
              <span>{relativeDay(r.createdAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
