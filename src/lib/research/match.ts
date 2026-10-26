/**
 * Turning a matcher's answer into changes: which quotes attach to which
 * existing idea, and which new ideas to create. Pure, so the rules hold
 * whatever does the matching (the model today, embeddings later). Tested in
 * tests/research-match.test.mjs.
 *
 * A quote goes to the idea the matcher named (live or dismissed; a quote on a
 * dismissed idea attaches quietly and the idea stays dismissed), or to a new
 * idea. A proposed new idea whose title is the same as an existing idea's,
 * or as another proposal's in the batch, once normalised, joins that one
 * instead of making a duplicate. A quote with no usable answer stays
 * unmatched: it is still stored evidence, just not part of an idea.
 */

export const IDEA_TITLE_MAX = 80;
export const IDEA_SUMMARY_MAX = 300;

/** Lowercase letters and digits only, single-spaced: how duplicate titles are recognised. */
export function normalizeIdeaTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function tidyText(text: string | null | undefined, max: number): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

export type LabelledIdea = { label: string; id: string; title: string };
export type LabelledQuote = { label: string; evidenceId: string };
export type MatchAnswer = {
  quote: string;
  idea: string;
  title?: string | null;
  summary?: string | null;
};

export type MatchResolution = {
  attach: Array<{ evidenceId: string; ideaId: string }>;
  create: Array<{ title: string; summary: string; evidenceIds: string[] }>;
  unmatched: string[];
};

export function resolveAssignments(input: {
  quotes: LabelledQuote[];
  answers: MatchAnswer[];
  live: LabelledIdea[];
  dismissed: LabelledIdea[];
}): MatchResolution {
  const byLabel = new Map<string, string>();
  const byTitle = new Map<string, string>();
  for (const idea of [...input.live, ...input.dismissed]) {
    byLabel.set(idea.label.toUpperCase(), idea.id);
    const key = normalizeIdeaTitle(idea.title);
    if (key && !byTitle.has(key)) byTitle.set(key, idea.id);
  }
  const answerFor = new Map<string, MatchAnswer>();
  for (const a of input.answers) {
    const label = a.quote.trim().toUpperCase();
    if (!answerFor.has(label)) answerFor.set(label, a);
  }

  const out: MatchResolution = { attach: [], create: [], unmatched: [] };
  const created = new Map<string, MatchResolution["create"][number]>();
  for (const q of input.quotes) {
    const answer = answerFor.get(q.label.toUpperCase());
    const ref = answer?.idea.trim().toUpperCase() ?? "";
    const existing = byLabel.get(ref);
    if (existing) {
      out.attach.push({ evidenceId: q.evidenceId, ideaId: existing });
      continue;
    }
    const title = ref === "NEW" ? tidyText(answer?.title, IDEA_TITLE_MAX) : "";
    const key = normalizeIdeaTitle(title);
    if (!key) {
      out.unmatched.push(q.evidenceId);
      continue;
    }
    const sameAsExisting = byTitle.get(key);
    if (sameAsExisting) {
      out.attach.push({ evidenceId: q.evidenceId, ideaId: sameAsExisting });
      continue;
    }
    const group = created.get(key);
    if (group) {
      group.evidenceIds.push(q.evidenceId);
      continue;
    }
    const fresh = {
      title,
      summary: tidyText(answer?.summary, IDEA_SUMMARY_MAX),
      evidenceIds: [q.evidenceId],
    };
    created.set(key, fresh);
    out.create.push(fresh);
  }
  return out;
}
