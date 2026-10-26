import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import {
  attachEvidence,
  createIdea,
  dismissedIdeasForMatching,
  getIdea,
  ideaEvidenceForScore,
  ideasTouchedByRun,
  liveIdeasForMatching,
  newModelNamedIdeas,
  renameModelIdea,
  runMatchableEvidence,
  saveIdeaScore,
} from "@/lib/research-ideas-db.server.ts";
import {
  IDEA_SUMMARY_MAX,
  IDEA_TITLE_MAX,
  resolveAssignments,
  tidyText,
  type LabelledIdea,
  type LabelledQuote,
  type MatchAnswer,
} from "@/lib/research/match.ts";
import { scoreIdea } from "@/lib/research/score.ts";
import { asDocument } from "@/server/ai";
import { callModel, type Generate } from "./models";
import type { ResearchStep, StepContext } from "./runs";

/**
 * Ideas: grouping a run's quotes into product ideas that build up across
 * runs, and scoring them in code. `match` assigns each pain, request and
 * workaround quote to an existing idea or a new one (40 quotes per unit);
 * `name` gives the run's new ideas consistent names (one writer call per
 * run); `score` recomputes every idea the run touched, and runs even when
 * the run is stopping, so what was gathered is always scored.
 */

export const MATCH_PROMPT_VERSION = "discover-match-v1";
export const NAME_PROMPT_VERSION = "discover-name-v1";

/** Quotes per matching call; live and dismissed ideas a matcher sees _(start values)_. */
const MATCH_BATCH = 40;
const MAX_LIVE_IDEAS = 150;
const MAX_DISMISSED_IDEAS = 100;
/** New ideas the naming pass renames in its one call. */
const MAX_NAMED = 40;

export type MatchInput = {
  seed: string;
  quotes: Array<LabelledQuote & { quote: string }>;
  live: Array<LabelledIdea & { summary: string }>;
  dismissed: LabelledIdea[];
};

/**
 * Anything that can say which idea each quote supports. The model does it
 * today; an embedding matcher can replace it without touching the steps.
 */
export type Matcher = (ctx: StepContext, input: MatchInput) => Promise<MatchAnswer[]>;

export type IdeaDeps = { generate?: Generate; matcher?: Matcher };

const matchSchema = z.object({
  matches: z
    .array(
      z.object({
        quote: z.string(),
        idea: z.string(),
        title: z.string().nullish(),
        summary: z.string().nullish(),
      }),
    )
    .max(80),
});

const MATCH_INSTRUCTIONS = `You group what people said into product ideas. An idea is one problem (or unmet want) that a product could solve, stated as the problem, e.g. "Editing remote interviews takes hours".

For each quote, answer with:
- the existing idea it supports (I1, I2, …), when it is about the same problem, even in different words;
- a dismissed idea it supports (D1, D2, …), when it is about that problem;
- or "new", with a title (the problem, under 10 words) and a one-sentence summary of who has it and when.

Quotes about the same new problem get exactly the same new title. Prefer an existing idea over a new one when it fits. Answer for every quote.`;

/** The model matcher: one worker call per batch, with quotes and ideas as untrusted text. */
export function modelMatcher(generate?: Generate): Matcher {
  return async (ctx, input) => {
    const ideas = input.live.map((i) => `${i.label}: ${i.title} — ${i.summary}`).join("\n");
    const dismissed = input.dismissed.map((i) => `${i.label}: ${i.title}`).join("\n");
    const quotes = input.quotes.map((q) => `${q.label}: ${q.quote}`).join("\n");
    const prompt = [
      `Topic: ${input.seed}`,
      `Existing ideas:\n${ideas ? asDocument(ideas) : "(none yet)"}`,
      dismissed ? `Dismissed ideas:\n${asDocument(dismissed)}` : "",
      `Quotes:\n${asDocument(quotes)}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const output = await callModel(
      ctx,
      {
        tier: "worker",
        schema: matchSchema,
        promptVersion: MATCH_PROMPT_VERSION,
        instructions: MATCH_INSTRUCTIONS,
        prompt,
        maxOutputTokens: 2_500,
        temperature: 0,
      },
      generate,
    );
    return output.matches;
  };
}

/**
 * `match`: the run's idea-kind quotes, in a fixed order, 40 per unit. A
 * resumed run continues at the next batch; a redone batch is answered from
 * the model cache, its new titles now match the ideas it created, and quotes
 * already attached stay put, so nothing is duplicated.
 */
export function matchStep(deps: IdeaDeps): ResearchStep {
  const matcher = deps.matcher ?? modelMatcher(deps.generate);
  return {
    name: "match",
    async work(ctx) {
      const db = await getDb();
      const { run } = ctx;
      const evidence = await runMatchableEvidence(db, run.id);
      const done = run.progress.matchBatches ?? 0;
      const batch = evidence.slice(done * MATCH_BATCH, (done + 1) * MATCH_BATCH);
      if (!batch.length) return true;

      const [live, dismissed] = await Promise.all([
        liveIdeasForMatching(db, run.topicId, MAX_LIVE_IDEAS),
        dismissedIdeasForMatching(db, run.topicId, MAX_DISMISSED_IDEAS),
      ]);
      const input: MatchInput = {
        seed: run.input.seed,
        quotes: batch.map((e, i) => ({ label: `Q${i + 1}`, evidenceId: e.id, quote: e.quote })),
        live: live.map((idea, i) => ({ label: `I${i + 1}`, ...idea })),
        dismissed: dismissed.map((idea, i) => ({ label: `D${i + 1}`, ...idea })),
      };
      const answers = await matcher(ctx, input);
      const resolution = resolveAssignments({ ...input, answers });

      const links = resolution.attach.map((a) => ({ ...a, runId: run.id }));
      for (const fresh of resolution.create) {
        const ideaId = await createIdea(db, {
          userId: run.userId,
          topicId: run.topicId,
          runId: run.id,
          title: fresh.title,
          summary: fresh.summary,
        });
        links.push(
          ...fresh.evidenceIds.map((evidenceId) => ({ ideaId, evidenceId, runId: run.id })),
        );
      }
      await attachEvidence(db, links);
      await ctx.saveProgress({ matchBatches: done + 1 });
      return (done + 1) * MATCH_BATCH >= evidence.length;
    },
  };
}

const nameSchema = z.object({
  ideas: z
    .array(z.object({ idea: z.string(), title: z.string(), summary: z.string().nullish() }))
    .max(60),
});

const NAME_INSTRUCTIONS = `You tidy the names of new product ideas so a list of them reads consistently. Each idea is a problem a product could solve.

For each idea give a title that states the problem plainly (under 10 words, no product names unless the problem is about that product, no hype) and a one-sentence summary of who has the problem and when. Use only what the quotes say.`;

/**
 * `name`: one writer call that renames the ideas this run created, using a
 * few of their quotes. Ideas the user renamed are never touched. Skipped
 * when the run is stopping; the matcher's names stand.
 */
export function nameStep(deps: IdeaDeps): ResearchStep {
  return {
    name: "name",
    async work(ctx) {
      if (ctx.run.progress.named) return true;
      const db = await getDb();
      const ideas = await newModelNamedIdeas(db, ctx.run.id, MAX_NAMED);
      if (ideas.length) {
        const list = ideas
          .map(
            (idea, i) =>
              `N${i + 1}: ${idea.title} — ${idea.summary}\n${idea.quotes.map((q) => `  "${q}"`).join("\n")}`,
          )
          .join("\n\n");
        const output = await callModel(
          ctx,
          {
            tier: "writer",
            schema: nameSchema,
            promptVersion: NAME_PROMPT_VERSION,
            instructions: NAME_INSTRUCTIONS,
            prompt: `Topic: ${ctx.run.input.seed}\n\nIdeas:\n${asDocument(list)}`,
            maxOutputTokens: 2_000,
            temperature: 0.2,
          },
          deps.generate,
        );
        for (const named of output.ideas) {
          const idea = ideas[Number(named.idea.trim().replace(/^N/i, "")) - 1];
          const title = tidyText(named.title, IDEA_TITLE_MAX);
          if (!idea || !title) continue;
          await renameModelIdea(
            db,
            idea.id,
            title,
            tidyText(named.summary, IDEA_SUMMARY_MAX) || idea.summary,
          );
        }
      }
      await ctx.saveProgress({ named: true });
      return true;
    },
  };
}

/**
 * `score` (final): recompute every idea the run created or added to, from
 * all of its evidence, and record what this run added. Plain code, no model.
 */
export function scoreStep(): ResearchStep {
  return {
    name: "score",
    final: true,
    async work(ctx) {
      const db = await getDb();
      const { run } = ctx;
      const ids = await ideasTouchedByRun(db, run.id);
      const now = Date.now();
      let created = 0;
      for (const id of ids) {
        const { evidence, addedByRun } = await ideaEvidenceForScore(db, id, run.id);
        await saveIdeaScore(db, id, {
          score: scoreIdea(evidence, now),
          evidenceCount: evidence.length,
          runId: run.id,
          addedByRun,
        });
        if ((await getIdea(db, id))?.firstRunId === run.id) created++;
      }
      await ctx.saveProgress({ ideasNew: created, ideasTouched: ids.length });
      return true;
    },
  };
}

/** The idea steps, in order. */
export function ideaSteps(deps: IdeaDeps = {}): ResearchStep[] {
  return [matchStep(deps), nameStep(deps), scoreStep()];
}
