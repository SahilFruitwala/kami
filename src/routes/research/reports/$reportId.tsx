import { createFileRoute, Link } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { ReportBodyView } from "@/components/research/report-view.tsx";
import { EmptyNote, ResearchUnavailable } from "@/components/research/research-ui.tsx";
import { useResearchReport, useResearchStatus } from "@/hooks/use-research.ts";
import type { LibraryItem } from "@/lib/library-item.ts";

export const Route = createFileRoute("/research/reports/$reportId")({
  component: ReportPage,
});

function ReportPage() {
  const { reportId } = Route.useParams();
  const navigate = Route.useNavigate();
  const status = useResearchStatus();
  const query = useResearchReport(reportId);

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  const report = query.data;
  const title =
    report?.kind === "question"
      ? report.question || "Question"
      : report?.ideaTitle || "Validate this idea";

  return (
    <AppShell active="research" onOpenItem={openItem}>
      {status.data && !status.data.enabled ? (
        <ResearchUnavailable />
      ) : (
        <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 pt-8 pb-10 sm:px-8">
          {report ? (
            <Link
              to="/research/$topicId"
              params={{ topicId: report.topicId }}
              search={{ tab: "reports" }}
              className="flex w-fit items-center gap-1.5 font-sans text-sm text-ink-soft hover:text-ink"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              {report.topicName || "Topic"}
            </Link>
          ) : null}
          {query.isPending ? (
            <div className="kami-sheet h-48 animate-pulse opacity-60" aria-hidden="true" />
          ) : query.isError ? (
            <EmptyNote>Couldn't find that report.</EmptyNote>
          ) : report ? (
            <>
              <header className="flex flex-col gap-1">
                <span className="font-sans text-xs text-ink-muted">
                  {report.kind === "question" ? "Question" : "Validate"}
                </span>
                <h1 className="font-display text-3xl leading-tight text-ink break-words">
                  {title}
                </h1>
              </header>
              <ReportBodyView report={report} />
            </>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
