import { ExternalLink } from "lucide-react";
import type { ReportClaimView, ReportView } from "@/lib/api/research.ts";

/** A cited Validate (or question) report: sections of claims, each with quotes or "unsupported". */
export function ReportBodyView({ report }: { report: ReportView }) {
  return (
    <div className="flex flex-col gap-6">
      {report.sections.map((section) => (
        <section key={section.id} className="kami-sheet flex flex-col gap-3 p-4 sm:p-6">
          <h2 className="font-display text-xl text-ink">{section.title}</h2>
          {section.claims.length ? (
            <ul className="flex flex-col gap-4">
              {section.claims.map((claim, i) => (
                <li key={`${section.id}-${i}`}>
                  <ClaimView claim={claim} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-body text-sm text-ink-muted">Nothing in this section.</p>
          )}
        </section>
      ))}
    </div>
  );
}

function ClaimView({ claim }: { claim: ReportClaimView }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-body text-sm leading-relaxed text-ink">{claim.text}</p>
      {claim.unsupported ? (
        <span className="w-fit rounded-full bg-paper-warm px-2 py-0.5 font-sans text-[10px] font-semibold tracking-wide text-ink-soft uppercase">
          Unsupported
        </span>
      ) : null}
      {claim.evidence.length ? (
        <ul className="flex flex-col gap-2">
          {claim.evidence.map((e) => (
            <li key={e.id} className="flex flex-col gap-1">
              <blockquote className="border-l-2 border-hanko/40 pl-3 font-body text-sm leading-relaxed text-ink-soft">
                “{e.quote}”
              </blockquote>
              <span className="flex flex-wrap items-center gap-x-2 pl-3 font-sans text-[11px] text-ink-muted">
                <a
                  href={e.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-hanko underline-offset-4 hover:underline"
                >
                  {e.source.site}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
                {e.postedAt ? <span>{new Date(e.postedAt).toLocaleDateString()}</span> : null}
                {e.match === "close" ? <span>close match</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
