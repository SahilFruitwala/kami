import { useEffect, useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx";
import { useIdea, useResearchRefresh } from "@/hooks/use-research.ts";
import { researchApi, type EvidenceView, type IdeaPatch } from "@/lib/api/research.ts";
import { toastError } from "@/lib/errors";
import type { IdeaScore } from "@/lib/research/kinds.ts";
import { ScoreBar } from "./idea-card.tsx";
import { COMPETITION_LABEL, SUB_SCORES } from "./research-format.ts";

/** Which quotes stand behind each sub-score (the same rules the score uses). */
const BEHIND: Record<(typeof SUB_SCORES)[number]["key"], (e: EvidenceView) => boolean> = {
  frequency: () => true,
  spread: () => true,
  intensity: (e) => e.strong || e.sentiment <= -2,
  pays: (e) => e.pays,
  recency: (e) => e.postedAt !== null,
};

const SCORE_HELP: Record<(typeof SUB_SCORES)[number]["key"], string> = {
  frequency: "How many different people raise it.",
  spread: "How many different sites and pages it comes up on.",
  intensity: "How strongly people feel it.",
  pays: "How often people mention paying, prices or budgets.",
  recency: "How recent the quotes are.",
};

/**
 * One idea in a sheet: rename it, star or dismiss it, and see each sub-score
 * with the quotes behind it. Every quote links to its page and shows the
 * site, its date, and whether it was matched closely rather than exactly.
 */
export function IdeaDetailSheet({
  ideaId,
  onClose,
}: {
  ideaId: string | null;
  onClose: () => void;
}) {
  const refresh = useResearchRefresh();
  const query = useIdea(ideaId);
  const detail = query.data;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [open, setOpen] = useState<string>("frequency");

  useEffect(() => {
    setEditing(false);
    setOpen("frequency");
  }, [ideaId]);

  async function save(patch: IdeaPatch) {
    if (!ideaId) return;
    try {
      await researchApi.updateIdea(ideaId, patch);
      setEditing(false);
      refresh();
    } catch (err) {
      toastError(err, "Couldn't save that change.");
    }
  }

  return (
    <Dialog open={ideaId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {!detail ? (
          <>
            <DialogTitle className="sr-only">Idea</DialogTitle>
            <div className="h-40 animate-pulse rounded-xl bg-paper-warm" aria-hidden="true" />
          </>
        ) : (
          <div className="flex flex-col gap-4">
            {editing ? (
              <form
                className="flex flex-col gap-2 pr-8"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save({ title: title.trim(), summary: summary.trim() });
                }}
              >
                <DialogTitle className="sr-only">Rename idea</DialogTitle>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  required
                />
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  maxLength={300}
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={!title.trim()}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="pr-8">
                <DialogTitle className="font-display text-2xl leading-tight text-ink">
                  {detail.idea.title}
                </DialogTitle>
                <DialogDescription className="mt-1 font-body text-sm text-ink-soft">
                  {detail.idea.summary || "No summary yet."}
                </DialogDescription>
              </div>
            )}

            {detail.idea.status !== "merged" && !editing ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTitle(detail.idea.title);
                    setSummary(detail.idea.summary);
                    setEditing(true);
                  }}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Rename
                </Button>
                {detail.idea.status === "starred" ? (
                  <Button size="sm" variant="outline" onClick={() => save({ status: "open" })}>
                    Unstar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => save({ status: "starred" })}>
                    Star
                  </Button>
                )}
                {detail.idea.status === "dismissed" ? (
                  <Button size="sm" variant="outline" onClick={() => save({ status: "open" })}>
                    Reopen
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => save({ status: "dismissed" })}>
                    Dismiss
                  </Button>
                )}
              </div>
            ) : null}

            {detail.idea.score ? (
              <ScoreSections
                score={detail.idea.score}
                evidence={detail.evidence}
                open={open}
                onToggle={(k) => setOpen((o) => (o === k ? "" : k))}
              />
            ) : (
              <QuoteList evidence={detail.evidence} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScoreSections({
  score,
  evidence,
  open,
  onToggle,
}: {
  score: IdeaScore;
  evidence: EvidenceView[];
  open: string;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-sans text-xs text-ink-muted">
        Score {Math.round(score.total * 100)} of 100 · {COMPETITION_LABEL[score.competition]}
      </p>
      {SUB_SCORES.map((s) => {
        const quotes = evidence.filter(BEHIND[s.key]);
        const expanded = open === s.key;
        return (
          <div key={s.key} className="rounded-xl bg-paper-warm/50 p-3">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => onToggle(s.key)}
              className="flex w-full flex-col gap-1 text-left"
            >
              <ScoreBar label={s.label} value={score[s.key]} />
              <span className="font-sans text-[11px] text-ink-muted">
                {SCORE_HELP[s.key]} {quotes.length} {quotes.length === 1 ? "quote" : "quotes"}.
              </span>
            </button>
            {expanded ? <QuoteList evidence={quotes} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function QuoteList({ evidence }: { evidence: EvidenceView[] }) {
  if (!evidence.length) return <p className="mt-2 font-body text-sm text-ink-muted">No quotes.</p>;
  return (
    <ul className="mt-2 flex flex-col gap-3">
      {evidence.map((e) => (
        <li key={e.id} className="flex flex-col gap-1">
          <blockquote className="border-l-2 border-hanko/40 pl-3 font-body text-sm leading-relaxed text-ink">
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
            {e.match === "close" ? (
              <span title="Matched the page closely, not word for word">close match</span>
            ) : null}
            {e.pays ? <span>mentions paying</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
