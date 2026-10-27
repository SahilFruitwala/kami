import { useState } from "react";
import type { ResearchCreditEntry } from "@/lib/research/credits.ts";
import { useResearchCredits } from "@/hooks/use-research.ts";
import { FieldLabel } from "@/components/settings/settings-ui.tsx";

const ENTRY_LABEL: Record<ResearchCreditEntry["kind"], string> = {
  grant: "Added",
  reserve: "Set aside for a run",
  release: "Returned",
};

/**
 * The caller's research credits: the balance and, behind a toggle, the
 * recent ledger. Styled like the Listening card. Credits are granted by
 * whoever runs this Kami, so there's no self-serve copy.
 */
export function CreditsPanel() {
  const view = useResearchCredits().data;
  const [open, setOpen] = useState(false);
  if (!view?.enabled) return null;

  return (
    <section aria-label="Research credits" className="kami-sheet flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <FieldLabel>Research credits</FieldLabel>
          <p className="mt-1 font-display text-2xl text-ink tabular-nums">
            {view.balance.toLocaleString()}
          </p>
          <p className="font-body text-sm text-ink-muted">
            A Quick run costs about 15–45, a Deep run up to 100. You're only charged what a run
            uses.
          </p>
        </div>
        {view.entries.length ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="rounded-full px-3 py-1.5 font-sans text-xs text-hanko transition-colors hover:bg-paper-warm"
          >
            {open ? "Hide history" : "History"}
          </button>
        ) : null}
      </div>
      {view.balance <= 0 && !view.entries.length ? (
        <p className="font-body text-sm text-ink-muted">
          You don't have research credits yet. Ask whoever runs this Kami to add some.
        </p>
      ) : null}
      {open ? (
        <ul className="divide-y divide-line">
          {view.entries.map((entry) => (
            <li key={entry.id} className="flex items-baseline justify-between gap-4 py-2">
              <span className="min-w-0 font-body text-sm text-ink">
                {ENTRY_LABEL[entry.kind]}
                {entry.note ? <span className="text-ink-muted">, {entry.note}</span> : null}
                <span className="block font-sans text-[11px] text-ink-muted">
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
              </span>
              <span className="shrink-0 font-sans text-sm tabular-nums text-ink">
                {entry.credits > 0 ? "+" : "−"}
                {Math.abs(entry.credits).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
