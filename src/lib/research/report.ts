import type { Depth, PlanQuery } from "./kinds.ts";
import { DEPTH_LIMITS } from "./discover.ts";

/**
 * Validate reports: fixed sections of claims, each citing evidence ids.
 * Code checks every id against the topic and fills an empty counter-evidence
 * section. Pure; tested in tests/research-report.test.mjs.
 */

export const VALIDATE_SECTION_IDS = [
  "problem",
  "how_bad",
  "solutions",
  "pays",
  "counter",
  "verdict",
] as const;
export type ValidateSectionId = (typeof VALIDATE_SECTION_IDS)[number];

export const VALIDATE_SECTION_TITLES: Record<ValidateSectionId, string> = {
  problem: "The problem",
  how_bad: "How bad it is",
  solutions: "Existing solutions",
  pays: "Willingness to pay",
  counter: "Counter-evidence",
  verdict: "Verdict",
};

export const COUNTER_SECTION_ID: ValidateSectionId = "counter";

/** Phrases a Validate plan must search for, so the report can try to knock the idea down. */
export const COUNTER_NEEDLES = [
  {
    needle: "good enough",
    intent: "pain" as const,
    query: (idea: string) => `${idea} good enough`,
  },
  {
    needle: "stopped using",
    intent: "switching" as const,
    query: (idea: string) => `why I stopped using ${idea}`,
  },
  {
    needle: "not worth it",
    intent: "alternatives" as const,
    query: (idea: string) => `${idea} alternative not worth it`,
  },
  { needle: "shut down", intent: "pain" as const, query: (idea: string) => `${idea} shut down` },
  {
    needle: "market too small",
    intent: "pricing" as const,
    query: (idea: string) => `${idea} market too small`,
  },
] as const;

export type ReportClaim = {
  text: string;
  evidenceIds: string[];
  /** Set when the claim cites no evidence that exists in the topic. */
  unsupported?: boolean;
};

export type ReportSection = {
  id: string;
  title: string;
  claims: ReportClaim[];
};

export type ReportBody = {
  sections: ReportSection[];
  /** Set when the run had no budget left to draft the report, so code wrote it. */
  partial?: boolean;
};

/** A model's quote label ("E3", "e3", "[E3]", "3") in canonical form, or null. */
export function canonicalLabel(raw: string): string | null {
  const m = raw.trim().match(/^\[?\s*e?\s*(\d{1,3})\s*\]?$/i);
  return m ? `E${Number(m[1])}` : null;
}

/**
 * Mark a report written without a model call (no budget left, or no quotes
 * to cite) and say why at the top of its first section.
 */
export function partialReport(body: ReportBody, reason: string): ReportBody {
  const [first, ...rest] = body.sections;
  if (!first) return { ...body, partial: true };
  return {
    sections: [{ ...first, claims: [{ text: reason, evidenceIds: [] }, ...first.claims] }, ...rest],
    partial: true,
  };
}

export function emptyValidateSections(): ReportSection[] {
  return VALIDATE_SECTION_IDS.map((id) => ({
    id,
    title: VALIDATE_SECTION_TITLES[id],
    claims: [],
  }));
}

/**
 * Keep only evidence ids that exist in the topic. A claim that is left with
 * none is kept and marked unsupported.
 */
export function checkClaims(
  sections: ReportSection[],
  knownIds: ReadonlySet<string>,
): ReportSection[] {
  return sections.map((section) => ({
    ...section,
    claims: section.claims
      .map((claim) => {
        const text = claim.text.replace(/\s+/g, " ").trim();
        if (!text) return null;
        const evidenceIds = [
          ...new Set(claim.evidenceIds.map((id) => id.trim()).filter(Boolean)),
        ].filter((id) => knownIds.has(id));
        const checked: ReportClaim = {
          text,
          evidenceIds,
          ...(evidenceIds.length ? {} : { unsupported: true }),
        };
        return checked;
      })
      .filter((c): c is ReportClaim => c !== null),
  }));
}

/** The counter-evidence section is never empty: if nothing turned up, say so and list the searches. */
export function ensureCounterSection(
  sections: ReportSection[],
  searched: readonly string[],
): ReportSection[] {
  const list = sections.some((s) => s.id === COUNTER_SECTION_ID)
    ? sections
    : [...sections, { id: COUNTER_SECTION_ID, title: VALIDATE_SECTION_TITLES.counter, claims: [] }];
  return list.map((section) => {
    if (section.id !== COUNTER_SECTION_ID) return section;
    if (section.claims.length) return section;
    const queries = searched.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean);
    const searchedBit = queries.length ? ` Searched: ${queries.join("; ")}.` : "";
    return {
      ...section,
      claims: [
        {
          text: `Nothing turned up that argues against this idea.${searchedBit}`,
          evidenceIds: [],
        },
      ],
    };
  });
}

/** Fold a model's sections into the fixed Validate template, then check citations. */
export function assembleValidateReport(
  modelSections: Array<{ id: string; claims: ReportClaim[] }>,
  knownIds: ReadonlySet<string>,
  searched: readonly string[],
): ReportBody {
  const byId = new Map(modelSections.map((s) => [s.id, s]));
  const sections = checkClaims(
    emptyValidateSections().map((section) => ({
      ...section,
      claims: byId.get(section.id)?.claims ?? [],
    })),
    knownIds,
  );
  return { sections: ensureCounterSection(sections, searched) };
}

function questionSectionId(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `${slug || "s"}_${index + 1}`;
}

/**
 * A free-form question report: the model's own sections, with the same
 * citation check as Validate. No fixed template. Always at least one section.
 */
export function assembleQuestionReport(
  modelSections: Array<{ title?: string; claims: ReportClaim[] }>,
  knownIds: ReadonlySet<string>,
): ReportBody {
  const sections = checkClaims(
    modelSections.map((s, i) => {
      const title =
        (s.title ?? "").replace(/\s+/g, " ").trim() || (i === 0 ? "Answer" : `Section ${i + 1}`);
      return { id: questionSectionId(title, i), title, claims: s.claims };
    }),
    knownIds,
  ).filter((s) => s.claims.length);
  if (sections.length) return { sections };
  return {
    sections: [
      {
        id: "answer_1",
        title: "Answer",
        claims: [
          {
            text: "Nothing in the quotes answered this question.",
            evidenceIds: [],
            unsupported: true,
          },
        ],
      },
    ],
  };
}

function ideaLabel(ideaTitle: string): string {
  return ideaTitle.replace(/\s+/g, " ").trim() || "this";
}

export function requiredCounterQueries(
  ideaTitle: string,
): Array<Pick<PlanQuery, "query" | "intent" | "counter">> {
  const idea = ideaLabel(ideaTitle);
  return COUNTER_NEEDLES.map((n) => ({
    query: n.query(idea),
    intent: n.intent,
    counter: true as const,
  }));
}

function hasNeedle(query: string, needle: string): boolean {
  return query.toLowerCase().includes(needle);
}

/** Checked counter-evidence searches a Validate plan must keep to start. */
export const MIN_COUNTER_QUERIES = 2;

/**
 * Checked queries in a plan that search for a counter phrase. Read from the
 * query text, not the `counter` flag, since an edited plan comes from the browser.
 */
export function counterSearchCount(plan: ReadonlyArray<Pick<PlanQuery, "query" | "checked">>) {
  return plan.filter(
    (q) => q.checked !== false && COUNTER_NEEDLES.some((n) => hasNeedle(q.query, n.needle)),
  ).length;
}

/**
 * Mark plan queries that already cover a required counter phrase, and append
 * any that are missing. Drops trailing non-counter queries when the depth's
 * cap would be exceeded, so the required set always fits.
 */
export function mergeCounterQueries(
  plan: PlanQuery[],
  ideaTitle: string,
  depth: Depth,
): PlanQuery[] {
  const marked = plan.map((q) =>
    COUNTER_NEEDLES.some((n) => hasNeedle(q.query, n.needle))
      ? { ...q, counter: true as const }
      : q,
  );
  const missing = COUNTER_NEEDLES.filter(
    (n) => !marked.some((q) => hasNeedle(q.query, n.needle)),
  ).map((n, i) => ({
    id: `c${i + 1}`,
    query: n.query(ideaLabel(ideaTitle)),
    intent: n.intent,
    checked: true,
    counter: true as const,
  }));
  const combined = [...marked, ...missing];
  const cap = DEPTH_LIMITS[depth].maxQueries;
  if (combined.length <= cap) return combined;
  const extras = combined.length - cap;
  const droppable = combined
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => !q.counter)
    .slice(-extras)
    .map(({ i }) => i);
  const drop = new Set(droppable);
  return combined.filter((_, i) => !drop.has(i)).slice(0, cap);
}
