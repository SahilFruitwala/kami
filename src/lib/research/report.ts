/**
 * Reports (spec §5.1, §5.2), pure. A report is sections of claims, each claim
 * naming the evidence behind it. The model drafts claims citing short labels
 * (E1, E2, …); `resolveReport` turns the labels into real evidence ids, drops
 * any that don't exist, and marks a claim with none left as unsupported, so
 * nothing a model made up reads as fact. Tested in tests/research-report.test.mjs.
 */
import type { PlanQuery } from "./kinds.ts";

export type ReportKind = "validate" | "question";

export type ReportClaim = {
  text: string;
  evidenceIds: string[];
  /** A claim that cites no real evidence. Shown, but flagged. */
  unsupported?: boolean;
  /** Written by code, not the model: says what was searched or why a section is empty. */
  note?: boolean;
};

export type ReportSection = { id: string; title: string; claims: ReportClaim[] };

export type ReportBody = {
  sections: ReportSection[];
  /** The searches the run sent, so an empty section can say what it looked for. */
  searched: string[];
  /** True when the run ran out of budget or was stopped before a full draft. */
  partial?: boolean;
};

/** The fixed sections of a Validate report, in order. */
export const VALIDATE_SECTIONS = [
  { id: "problem", title: "The problem", hint: "who has it, and when it comes up" },
  { id: "severity", title: "How bad it is", hint: "how often and how strongly people feel it" },
  {
    id: "existing",
    title: "Existing solutions",
    hint: "what people use today and what they say of it",
  },
  { id: "pays", title: "Willingness to pay", hint: "prices, budgets, and signs people would pay" },
  { id: "counter", title: "Counter-evidence", hint: "reasons the idea may not work" },
  {
    id: "verdict",
    title: "Verdict",
    hint: "what the evidence supports, open questions, and risks to check next",
  },
] as const;

export const COUNTER_SECTION = "counter";

/** Counter-evidence searches a Validate plan must keep (spec §5.1). */
export const MIN_COUNTER_QUERIES = 2;

const MAX_CLAIMS_PER_SECTION = 8;
const MAX_FREE_SECTIONS = 6;
const MAX_CLAIM_CHARS = 700;

export function counterQueryCount(plan: Array<Pick<PlanQuery, "intent" | "checked">>): number {
  return plan.filter((q) => q.intent === "counter" && q.checked !== false).length;
}

/** Searches that look for reasons against an idea, used when a drafted plan has too few. */
export function fallbackCounterQueries(seed: string): string[] {
  const subject = seed.replace(/\s+/g, " ").trim().slice(0, 80);
  return [
    `${subject} good enough already`,
    `why I stopped using tools for ${subject}`,
    `${subject} not worth paying for`,
    `${subject} market too small`,
  ];
}

/**
 * Make sure a drafted Validate plan has at least MIN_COUNTER_QUERIES checked
 * counter-evidence searches: it tops them up from `fallbackCounterQueries`,
 * replacing the last other queries when the plan is already at `max`.
 */
export function ensureCounterQueries(plan: PlanQuery[], seed: string, max: number): PlanQuery[] {
  const out = [...plan];
  const have = () => counterQueryCount(out);
  const norms = new Set(out.map((q) => q.query.toLowerCase()));
  for (const query of fallbackCounterQueries(seed)) {
    if (have() >= MIN_COUNTER_QUERIES) break;
    if (norms.has(query.toLowerCase())) continue;
    const fresh: PlanQuery = {
      id: `c${out.length + 1}`,
      query,
      intent: "counter",
      checked: true,
    };
    if (out.length < max) out.push(fresh);
    else {
      const at = out.map((q) => q.intent !== "counter").lastIndexOf(true);
      if (at === -1) break;
      out[at] = fresh;
    }
  }
  return out;
}

export type DraftClaim = { text: string; evidence: string[] };
export type DraftSection = { id?: string; title?: string; claims: DraftClaim[] };

/** Model labels "E3", "e3", "[E3]" or "3" → the label in canonical form, or null. */
function canonicalLabel(raw: string): string | null {
  const m = raw.trim().match(/^\[?\s*e?\s*(\d{1,3})\s*\]?$/i);
  return m ? `E${Number(m[1])}` : null;
}

function resolveClaims(
  claims: DraftClaim[],
  labels: ReadonlyMap<string, string>,
  valid: ReadonlySet<string>,
): ReportClaim[] {
  const out: ReportClaim[] = [];
  for (const claim of claims) {
    const text = claim.text.replace(/\s+/g, " ").trim().slice(0, MAX_CLAIM_CHARS).trim();
    if (!text) continue;
    const ids: string[] = [];
    for (const raw of claim.evidence) {
      const label = canonicalLabel(raw);
      const id = label ? labels.get(label) : undefined;
      if (id && valid.has(id) && !ids.includes(id)) ids.push(id);
    }
    out.push(
      ids.length ? { text, evidenceIds: ids } : { text, evidenceIds: [], unsupported: true },
    );
    if (out.length >= MAX_CLAIMS_PER_SECTION) break;
  }
  return out;
}

function note(text: string): ReportClaim {
  return { text, evidenceIds: [], note: true };
}

function slug(title: string, i: number): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || `section-${i + 1}`;
}

export type ResolveOptions = {
  /** Label → evidence id for the evidence the model was shown. */
  labels: ReadonlyMap<string, string>;
  /** Evidence ids that exist in the topic (the labels' targets, normally). */
  valid: ReadonlySet<string>;
  searched: string[];
  /** Validate uses the fixed sections; a question lets the model choose its own. */
  fixed?: ReadonlyArray<{ id: string; title: string }>;
};

/**
 * Turn a model's draft into a stored body. Fixed sections always appear, in
 * order; a section the model left empty says so. The counter-evidence
 * section is never empty: when nothing supported turns up it says so and
 * lists what was searched.
 */
export function resolveReport(draft: DraftSection[], opts: ResolveOptions): ReportBody {
  const { labels, valid, searched, fixed } = opts;
  const sections: ReportSection[] = [];

  if (fixed) {
    for (const spec of fixed) {
      const drafted = draft.filter((d) => (d.id ?? "").trim().toLowerCase() === spec.id);
      let claims = resolveClaims(
        drafted.flatMap((d) => d.claims),
        labels,
        valid,
      );
      const supported = claims.some((c) => !c.unsupported);
      if (spec.id === COUNTER_SECTION && !supported) {
        const looked = searched.length ? ` It searched for: ${searched.join("; ")}.` : "";
        claims = [
          ...claims,
          note(`No counter-evidence backed by a quote turned up in what was read.${looked}`),
        ];
      } else if (!claims.length) {
        claims = [note("Nothing in what was read speaks to this.")];
      }
      sections.push({ id: spec.id, title: spec.title, claims });
    }
  } else {
    for (const [i, d] of draft.entries()) {
      const claims = resolveClaims(d.claims, labels, valid);
      const title = (d.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!claims.length || !title) continue;
      sections.push({ id: slug(title, i), title, claims });
      if (sections.length >= MAX_FREE_SECTIONS) break;
    }
    if (!sections.length) {
      sections.push({
        id: "answer",
        title: "Answer",
        claims: [note("Nothing in what was read answers this question.")],
      });
    }
  }
  return { sections, searched };
}

/** The report for a run that couldn't afford the drafting call: no model words, only what it searched. */
export function fallbackReport(
  searched: string[],
  fixed: ResolveOptions["fixed"],
  reason: string,
): ReportBody {
  const base = resolveReport([], { labels: new Map(), valid: new Set(), searched, fixed });
  const first = base.sections[0];
  if (first)
    first.claims = [
      note(reason),
      ...first.claims.filter((c) => !c.note || first.id === COUNTER_SECTION),
    ];
  return { ...base, partial: true };
}

/** Claims in a body that show as unsupported (for the report page's tally). */
export function unsupportedCount(body: ReportBody): number {
  return body.sections.reduce((n, s) => n + s.claims.filter((c) => c.unsupported).length, 0);
}

/** Every evidence id a body cites, in first-seen order. */
export function citedEvidenceIds(body: ReportBody): string[] {
  const seen: string[] = [];
  for (const s of body.sections) {
    for (const c of s.claims) for (const id of c.evidenceIds) if (!seen.includes(id)) seen.push(id);
  }
  return seen;
}
