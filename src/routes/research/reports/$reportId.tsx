import { createFileRoute, Link } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { QuoteList } from "@/components/research/idea-detail.tsx";
import { EmptyNote } from "@/components/research/research-ui.tsx";
import { useReport } from "@/hooks/use-research.ts";
import type { ReportView } from "@/lib/api/research.ts";
import type { LibraryItem } from "@/lib/library-item.ts";
import { cn } from "@/lib/utils.ts";

export const Route = createFileRoute("/research/reports/$reportId")({
  component: ReportPage,
});

/**
 * A Validate or question report: sections of claims, each with the quotes
 * it cites (collapsed under it). A claim that cites no stored quote is
 * flagged as unsupported instead of being shown as fact.
 */
function ReportPage() {
  const { reportId } = Route.useParams();
  const navigate = Route.useNavigate();
  const query = useReport(reportId);

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  const view = query.data;
  return (
    <AppShell active="research" onOpenItem={openItem}>
      <div className="mx-auto flex w-full max-w-[800px] flex-col gap-6 px-4 pt-8 pb-10 sm:px-8">
        {view ? (
          <Link
            to="/research/$topicId"
            params={{ topicId: view.report.topicId }}
            search={{ tab: "reports" }}
            className="flex w-fit items-center gap-1.5 font-sans text-sm text-ink-soft hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Reports
          </Link>
        ) : null}
        {query.isPending ? (
          <div className="kami-sheet h-48 animate-pulse opacity-60" aria-hidden="true" />
        ) : query.isError ? (
          <EmptyNote>Couldn't find that report.</EmptyNote>
        ) : view ? (
          <ReportBody view={view} />
        ) : null}
      </div>
    </AppShell>
  );
}

function ReportBody({ view }: { view: ReportView }) {
  const { report, body, evidence } = view;
  return (
    <>
      <header className="flex flex-col gap-2">
        <span className="font-sans text-xs text-ink-muted">
          {report.kind === "validate" ? "Validation" : "Question"} ·{" "}
          {new Date(report.createdAt).toLocaleDateString()}
        </span>
        <h1 className="font-display text-3xl leading-tight text-ink break-words">
          {report.question}
        </h1>
        <p className="font-body text-sm text-ink-soft">
          Every claim lists the quotes it rests on. A claim marked unsupported cites none, so treat
          it as the writer's guess.
          {report.unsupported
            ? ` ${report.unsupported} ${report.unsupported === 1 ? "claim here is" : "claims here are"} unsupported.`
            : ""}
        </p>
        {report.partial ? (
          <p className="kami-sheet p-4 font-body text-sm text-ink-soft">
            This report is partial: the run found no usable quotes, or ran out of budget before it
            could be written in full.
          </p>
        ) : null}
        <Link
          to="/research/runs/$runId"
          params={{ runId: report.runId }}
          className="w-fit font-sans text-sm text-hanko underline-offset-4 hover:underline"
        >
          See the run behind it
        </Link>
      </header>

      {body.sections.map((section) => (
        <section key={section.id} aria-label={section.title} className="kami-sheet p-4 sm:p-6">
          <h2 className="font-display text-xl text-ink">{section.title}</h2>
          <ul className="mt-3 flex flex-col gap-4">
            {section.claims.map((claim, i) => {
              const quotes = claim.evidenceIds.flatMap((id) =>
                evidence[id] ? [evidence[id]] : [],
              );
              return (
                <li key={i} className="flex flex-col gap-1">
                  <p
                    className={cn(
                      "font-body text-[15px] leading-relaxed",
                      claim.note ? "text-ink-muted italic" : "text-ink",
                    )}
                  >
                    {claim.text}
                  </p>
                  {claim.unsupported ? (
                    <span className="flex items-center gap-1 font-sans text-[11px] text-destructive">
                      <CircleAlert className="size-3" aria-hidden="true" />
                      Unsupported: no quote backs this
                    </span>
                  ) : null}
                  {quotes.length ? (
                    <details>
                      <summary className="w-fit cursor-pointer font-sans text-[11px] text-hanko">
                        {quotes.length} {quotes.length === 1 ? "quote" : "quotes"}
                      </summary>
                      <QuoteList evidence={quotes} />
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
