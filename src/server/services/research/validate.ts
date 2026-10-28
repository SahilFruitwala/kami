import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import { redditConfigured } from "@/lib/reddit.server.ts";
import { getIdea } from "@/lib/research-ideas-db.server.ts";
import {
  recentTopicQueries,
  topicQueryNorms,
  type RunRow,
  type TopicRow,
} from "@/lib/research-db.server.ts";
import { topicPlayers } from "@/lib/research-players-db.server.ts";
import { evidenceForReport, insertReport } from "@/lib/research-reports-db.server.ts";
import type { RunSpend } from "@/lib/research/credits.ts";
import { DEPTH_LIMITS, searchText } from "@/lib/research/discover.ts";
import {
  VALIDATE_SECTIONS,
  ensureCounterQueries,
  fallbackReport,
  resolveReport,
  type ReportBody,
} from "@/lib/research/report.ts";
import { asDocument } from "@/server/ai";
import { extractStep, fetchStep, pickedSources, type StepDeps } from "./evidence";
import {
  PLAN_INSTRUCTIONS,
  planFromModel,
  planSchema,
  searchStep,
  triageStep,
  type DiscoverDeps,
} from "./discover";
import { callModel, type Generate } from "./models";
import {
  BudgetExceededError,
  RunStepError,
  registerRunSteps,
  type DraftResult,
  type Meter,
  type ResearchStep,
} from "./runs";

/**
 * Validate (spec §5.1): try to knock an idea down with a cited report. The
 * run reuses Discover's search, triage, fetch and extract, with a plan that
 * must include counter-evidence searches, and ends with `report`: one writer
 * call that drafts sections of claims citing quotes by label. Code resolves
 * the labels to stored evidence, so a claim with no real quote shows as
 * unsupported (./report.ts).
 *
 * "Ask a question" (spec §5.2) is the same flow with `kind = question`: a
 * plan that looks for what people say about the question, and a report
 * whose sections the writer chooses, with the same claim and citation rules.
 */

export const VALIDATE_PLAN_PROMPT_VERSION = "validate-plan-v1";
export const REPORT_PROMPT_VERSION = "validate-report-v1";
export const QUESTION_PLAN_PROMPT_VERSION = "question-plan-v1";
export const QUESTION_REPORT_PROMPT_VERSION = "question-report-v1";

/** Quotes a report draft is shown, and the longest one it sees. */
export const REPORT_EVIDENCE_LIMIT = 60;
const REPORT_QUOTE_CHARS = 500;

const VALIDATE_PLAN_INSTRUCTIONS = `${PLAN_INSTRUCTIONS}

This plan checks one product idea, so besides searches that find the problem it needs searches that look for reasons the idea may NOT work. Give those intent "counter". Phrase them the way people write when they have given up on something or found it good enough: "why I stopped using", "good enough free alternative", "not worth paying for", "shut down", "no one uses", "market too small". Name the likely competitors or the category in them when you can.`;

const QUESTION_PLAN_INSTRUCTIONS = `${PLAN_INSTRUCTIONS}

This plan answers one question, not a general survey. Write queries that find what real people say that bears directly on it: their experience, what they use, what it costs, what went wrong. Use intent "pain" for complaints and "alternatives" or "pricing" where they fit; do not use "counter".`;

function counterShare(maxQueries: number): number {
  return Math.max(3, Math.round(maxQueries / 3));
}

/**
 * The drafter `draftRun` calls for a Validate run: a writer-tier plan for
 * the idea's own words plus a required counter-evidence set. Spends no
 * Firecrawl credits; its tokens are charged if the run starts.
 */
export function validateDrafter(
  deps: DiscoverDeps = {},
  kind: "validate" | "question" = "validate",
) {
  return async (run: RunRow, topic: TopicRow): Promise<DraftResult> => {
    const db = await getDb();
    const idea = run.input.ideaId ? await getIdea(db, run.input.ideaId) : null;
    const [sent, recent] = await Promise.all([
      topicQueryNorms(db, topic.id),
      recentTopicQueries(db, topic.id, 50),
    ]);
    const spend = { tokensIn: 0, tokensOut: 0 };
    const meter: Meter = {
      ensureBudget: () => {},
      recordSpend: async (s: Partial<RunSpend>) => {
        spend.tokensIn += s.tokensIn ?? 0;
        spend.tokensOut += s.tokensOut ?? 0;
      },
    };
    const limits = DEPTH_LIMITS[run.depth];
    const input = run.input;
    const never = [...(input.excludeSites ?? []), ...(redditConfigured() ? [] : ["reddit.com"])];
    const asking = kind === "question";
    const prompt = [
      asking ? `Question: ${input.seed}` : `Idea to check: ${input.seed}`,
      idea?.summary ? `Who has it: ${idea.summary}` : "",
      input.audience && input.audience !== "any" ? `Audience: ${input.audience.toUpperCase()}` : "",
      input.includeSites?.length ? `Only these sites: ${input.includeSites.join(", ")}` : "",
      never.length ? `Never these sites: ${never.join(", ")}` : "",
      input.sinceMonths ? `Results from the last ${input.sinceMonths} months only.` : "",
      asking
        ? `Write ${limits.maxQueries} queries.`
        : `Write ${limits.maxQueries} queries, at least ${counterShare(limits.maxQueries)} of them with intent "counter".`,
      recent.length
        ? `Already searched (don't repeat):\n${recent.map((q) => `- ${q}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const output = await callModel(
      meter,
      {
        tier: "writer",
        schema: planSchema,
        promptVersion: asking ? QUESTION_PLAN_PROMPT_VERSION : VALIDATE_PLAN_PROMPT_VERSION,
        instructions: asking ? QUESTION_PLAN_INSTRUCTIONS : VALIDATE_PLAN_INSTRUCTIONS,
        prompt,
        maxOutputTokens: 1_500,
        temperature: 0.4,
      },
      deps.generate,
    );
    const drafted = planFromModel(output, run, sent).filter(
      (q) => redditConfigured() || q.site !== "reddit.com",
    );
    const plan = asking ? drafted : ensureCounterQueries(drafted, input.seed, limits.maxQueries);
    if (!plan.some((q) => q.checked)) {
      throw new RunStepError(
        `Couldn't draft searches for that ${asking ? "question" : "idea"}. Try again in a moment.`,
      );
    }
    return { plan, ...spend };
  };
}

// ---------- Report ----------

const reportSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().nullish(),
        title: z.string().nullish(),
        claims: z
          .array(z.object({ text: z.string(), evidence: z.array(z.string()).catch([]) }))
          .max(12),
      }),
    )
    .max(10),
});

const VALIDATE_REPORT_INSTRUCTIONS = `You write a short, honest report that tests a product idea against quotes real people wrote. Each quote is in a <document> block with a label (E1, E2, …).

Write the report as sections, using exactly these section ids: ${VALIDATE_SECTIONS.map((s) => `"${s.id}" (${s.title}: ${s.hint})`).join("; ")}.

Rules:
- Every claim is one or two plain sentences, and lists the labels of the quotes that support it in "evidence". A claim you cannot support with a quote must not be written.
- Use only what the quotes say. Do not add facts, numbers, product names or opinions that are not in them.
- The "counter" section is the most important: look hard for quotes that argue against the idea (a good-enough free option, people who gave up, tiny or shrinking demand, complaints that nobody pays). If there are none, leave it empty.
- The "verdict" section says what the evidence supports and what it does not, then lists the main risks and open questions to check next. Cite quotes where you can.
- Keep it short: at most 4 claims per section.`;

/** Products the topic already knows (Explore), named so "Existing solutions" can be organised around them. */
const KNOWN_PLAYERS = 12;

async function knownProducts(topicId: string): Promise<string> {
  const players = (await topicPlayers(await getDb(), topicId))
    .sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name))
    .slice(0, KNOWN_PLAYERS);
  if (!players.length) return "";
  const lines = players.map((p) => `- ${p.name}${p.oneLiner ? `: ${p.oneLiner}` : ""}`);
  return `Products this topic already knows (organise "existing" claims around them, but cite quotes, not this list):\n${asDocument(lines.join("\n"))}`;
}

const QUESTION_REPORT_INSTRUCTIONS = `You answer a question using only quotes real people wrote. Each quote is in a <document> block with a label (E1, E2, …).

Write the answer as 2 to 5 short sections, each with a plain title ("title") and claims.

Rules:
- Every claim is one or two plain sentences, and lists the labels of the quotes that support it in "evidence". A claim you cannot support with a quote must not be written.
- Use only what the quotes say. Do not add facts, numbers, product names or opinions that are not in them.
- Where the quotes disagree, say so, with the quotes on each side.
- If the quotes do not answer the question, say that in one claim and stop.
- At most 5 claims per section.`;

function evidenceBlock(
  rows: Array<{ quote: string; kind: string; site: string; strong: boolean }>,
): string {
  return rows
    .map((e, i) =>
      asDocument(e.quote.slice(0, REPORT_QUOTE_CHARS), {
        source: `E${i + 1}`,
        kind: e.kind,
        site: e.site,
      }),
    )
    .join("\n\n");
}

/** The searches a run sent, for an empty section to name. */
function searchedQueries(run: RunRow): string[] {
  return run.plan.filter((q) => q.checked).map((q) => searchText(q));
}

/**
 * `report` (final): draft the report from the quotes behind the idea and the
 * pages this run read, then store it. Runs even when the run is stopping. With
 * no quotes it stores an honest empty report without calling a model, and
 * when the budget is gone it stores a partial one built without a model.
 */
export function reportStep(
  deps: { generate?: Generate } = {},
  kind: "validate" | "question" = "validate",
): ResearchStep {
  const fixed = kind === "validate" ? VALIDATE_SECTIONS : undefined;
  return {
    name: "report",
    final: true,
    async work(ctx) {
      const db = await getDb();
      const { run } = ctx;
      const searched = searchedQueries(run);
      const sources = await pickedSources(ctx);
      const evidence = await evidenceForReport(db, run.topicId, {
        ideaId: run.input.ideaId,
        sourceIds: sources.map((s) => s.id),
        limit: REPORT_EVIDENCE_LIMIT,
      });

      let body: ReportBody;
      if (!evidence.length) {
        body = resolveReport([], {
          labels: new Map(),
          valid: new Set(),
          searched,
          fixed,
        });
        body.partial = true;
      } else {
        try {
          const output = await callModel(
            ctx,
            {
              tier: "writer",
              schema: reportSchema,
              promptVersion:
                kind === "validate" ? REPORT_PROMPT_VERSION : QUESTION_REPORT_PROMPT_VERSION,
              instructions:
                kind === "validate" ? VALIDATE_REPORT_INSTRUCTIONS : QUESTION_REPORT_INSTRUCTIONS,
              prompt: [
                `${kind === "validate" ? "Idea" : "Question"}: ${run.input.seed}`,
                kind === "validate" ? await knownProducts(run.topicId) : "",
                `Quotes:\n${evidenceBlock(evidence)}`,
              ]
                .filter(Boolean)
                .join("\n\n"),
              maxOutputTokens: 4_000,
              temperature: 0.2,
            },
            deps.generate,
          );
          const labels = new Map(evidence.map((e, i) => [`E${i + 1}`, e.id] as const));
          body = resolveReport(
            output.sections.map((s) => ({
              id: s.id ?? undefined,
              title: s.title ?? undefined,
              claims: s.claims,
            })),
            {
              labels,
              valid: new Set(evidence.map((e) => e.id)),
              searched,
              fixed,
            },
          );
        } catch (err) {
          if (!(err instanceof BudgetExceededError)) throw err;
          body = fallbackReport(
            searched,
            fixed,
            "This run reached its budget before the report could be written. Try again with a deeper run.",
          );
        }
      }
      await insertReport(db, {
        userId: run.userId,
        topicId: run.topicId,
        runId: run.id,
        kind,
        ideaId: run.input.ideaId ?? null,
        question: run.input.seed,
        body,
      });
      return true;
    },
  };
}

/** The steps of a Validate or question run, in order. */
export function validateSteps(
  deps: DiscoverDeps = {},
  kind: "validate" | "question" = "validate",
): ResearchStep[] {
  const stepDeps: StepDeps = deps;
  return [
    searchStep(deps),
    triageStep(deps),
    fetchStep(stepDeps),
    extractStep(stepDeps),
    reportStep(deps, kind),
  ];
}

registerRunSteps("validate", validateSteps());
registerRunSteps("question", validateSteps({}, "question"));
