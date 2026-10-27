import { createFileRoute } from "@tanstack/react-router";
import { addTransitionType, startTransition, useState } from "react";
import { Compass, HelpCircle, Lightbulb, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { GlossHeader } from "@/components/gloss/primitives.tsx";
import { CreditsPanel } from "@/components/research/credits-panel.tsx";
import { AskQuestionForm } from "@/components/research/ask-question-form.tsx";
import { FindIdeasForm } from "@/components/research/find-ideas-form.tsx";
import { MapSpaceForm } from "@/components/research/map-space-form.tsx";
import { ResearchUnavailable } from "@/components/research/research-ui.tsx";
import { TopicsList } from "@/components/research/topics-list.tsx";
import { useResearchStatus } from "@/hooks/use-research.ts";
import type { LibraryItem } from "@/lib/library-item.ts";
import { cn } from "@/lib/utils.ts";

export const Route = createFileRoute("/research/")({
  component: ResearchHome,
});

/**
 * Research home: three ways to start (Find ideas, Ask a question, Map a
 * space), the caller's topics, and their credits.
 */
function ResearchHome() {
  const navigate = Route.useNavigate();
  const status = useResearchStatus();
  const [starting, setStarting] = useState<"find" | "ask" | "map" | null>(null);

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
        <>
          <GlossHeader
            icon={<Lightbulb className="size-4" aria-hidden="true" />}
            eyebrow="Research"
            title="Find what people need"
            description="Read what real people say online, keep their exact words, and turn their complaints into ranked product ideas."
          />
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 pt-8 pb-10 sm:px-8">
            <section aria-label="Start" className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <StartCard
                icon={<Search className="size-4" aria-hidden="true" />}
                title="Find ideas"
                copy="Search discussions and reviews in a space for problems worth solving."
                active={starting === "find"}
                onClick={() => setStarting((v) => (v === "find" ? null : "find"))}
              />
              <StartCard
                icon={<HelpCircle className="size-4" aria-hidden="true" />}
                title="Ask a question"
                copy="Get a cited answer from what people say in this space."
                active={starting === "ask"}
                onClick={() => setStarting((v) => (v === "ask" ? null : "ask"))}
              />
              <StartCard
                icon={<Compass className="size-4" aria-hidden="true" />}
                title="Map a space"
                copy="See who's already there and what they charge."
                active={starting === "map"}
                onClick={() => setStarting((v) => (v === "map" ? null : "map"))}
              />
            </section>
            {starting === "find" ? (
              <section aria-label="Find ideas" className="kami-sheet p-4 sm:p-6">
                <FindIdeasForm />
              </section>
            ) : null}
            {starting === "ask" ? (
              <section aria-label="Ask a question" className="kami-sheet p-4 sm:p-6">
                <AskQuestionForm />
              </section>
            ) : null}
            {starting === "map" ? (
              <section aria-label="Map a space" className="kami-sheet p-4 sm:p-6">
                <MapSpaceForm />
              </section>
            ) : null}
            <CreditsPanel />
            <section aria-label="Topics" className="flex flex-col gap-3">
              <h2 className="font-display text-xl text-ink">Topics</h2>
              <TopicsList />
            </section>
          </div>
        </>
      )}
    </AppShell>
  );
}

function StartCard({
  icon,
  title,
  copy,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 font-display text-lg text-ink">
        {icon}
        {title}
      </span>
      <span className="font-body text-sm leading-relaxed text-ink-soft">{copy}</span>
    </>
  );
  if (!onClick) {
    return <div className="kami-sheet flex flex-col gap-1.5 p-4 opacity-60">{body}</div>;
  }
  return (
    <button
      type="button"
      aria-expanded={active}
      onClick={onClick}
      className={cn(
        "kami-sheet flex flex-col gap-1.5 p-4 text-left transition-colors hover:bg-paper-warm focus-visible:ring-2 focus-visible:ring-hanko/40 focus-visible:outline-none",
        active && "ring-1 ring-hanko/40",
      )}
    >
      {body}
    </button>
  );
}
