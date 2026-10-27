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

/**
 * An idea's title and summary, tidied. Models sometimes put "Title. Summary
 * sentence…" all in the title and leave the summary empty; then the title is
 * split at its first sentence end, so neither is cut off at the title limit.
 */
export function ideaText(
  title: string | null | undefined,
  summary: string | null | undefined,
): { title: string; summary: string } {
  let t = tidyText(title, Number.MAX_SAFE_INTEGER);
  let s = tidyText(summary, Number.MAX_SAFE_INTEGER);
  const split = t.match(/^(.+?[.!?])\s+(\S.*)$/);
  if (split && (!s || t.length > IDEA_TITLE_MAX)) {
    t = split[1].replace(/\.$/, "");
    s = s || split[2];
  }
  return { title: tidyText(t, IDEA_TITLE_MAX), summary: tidyText(s, IDEA_SUMMARY_MAX) };
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
    const text = ref === "NEW" ? ideaText(answer?.title, answer?.summary) : null;
    const title = text?.title ?? "";
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
      summary: text?.summary ?? "",
      evidenceIds: [q.evidenceId],
    };
    created.set(key, fresh);
    out.create.push(fresh);
  }
  return out;
}
