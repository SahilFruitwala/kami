import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/lib/db.server";
import { PageReadError } from "@/lib/page-read-error.ts";
import {
  insertEvidence,
  sourcesByUrlKey,
  topicUrlKeys,
  type EvidenceInput,
  type SourceRow,
} from "@/lib/research-db.server.ts";
import { authorKey, cleanNames, parsePostedAt, selectChunks } from "@/lib/research/evidence.ts";
import { EVIDENCE_KINDS } from "@/lib/research/kinds.ts";
import { batchItems } from "@/lib/research/model-calls.ts";
import { urlKey } from "@/lib/research/sources.ts";
import { verifyQuote } from "@/lib/research/verify.ts";
import { asDocument } from "@/server/ai";
import { getOrFetchSource, type FirecrawlCalls } from "./fetch";
import { callModel, type Generate } from "./models";
import { RunStepError, type ResearchStep, type StepContext } from "./runs";

/**
 * Turning a run's picked pages into evidence: `fetch` reads each page once
 * (through the source cache), and `extract` sends the parts of each page
 * worth reading to the worker model in batches, then checks every quote it
 * returns against the stored page in code before storing it. Quotes that
 * aren't on the page are dropped and counted, never stored.
 */

export const EXTRACT_PROMPT_VERSION = "discover-extract-v2";

/** Chunks per extraction call, and the characters they may take. */
const EXTRACT_BATCH = { maxItems: 12, maxChars: 24_000 };

/** Swappable outside calls (tests pass fakes). */
export type StepDeps = { calls?: Partial<FirecrawlCalls>; generate?: Generate };

/** Firecrawl failures that will fail every page, so the run should stop rather than skip. */
const FATAL_FIRECRAWL = /credits are used up|rejected the server's API key|not configured/i;

/** The run's picked pages that are now stored sources, in pick order. */
async function pickedSources(ctx: StepContext): Promise<SourceRow[]> {
  const keys = (ctx.run.progress.toRead ?? []).map(urlKey).filter((k): k is string => Boolean(k));
  const found = await sourcesByUrlKey(await getDb(), ctx.run.userId, keys);
  return keys.map((k) => found.get(k)).filter((s): s is SourceRow => Boolean(s));
}

/**
 * `fetch`: one unit per picked page. A page that can't be read is skipped
 * and listed in `progress.skippedUrls` (never retried), and the best spare
 * pick takes its place in `toRead`; a fresh cached copy costs nothing.
 */
export function fetchStep(deps: StepDeps): ResearchStep {
  return {
    name: "fetch",
    // A page read plus up to 45 s of rate-limit waits and retries.
    unitBudgetMs: 150_000,
    async work(ctx) {
      const { run } = ctx;
      const toRead = run.progress.toRead ?? [];
      const skipped = run.progress.skippedUrls ?? [];
      const have = await topicUrlKeys(await getDb(), run.userId, run.topicId);
      const isRead = (url: string) => have.has(urlKey(url) ?? "");
      const next = toRead.find((url) => !isRead(url) && !skipped.includes(url));
      if (!next) {
        await ctx.saveProgress({ read: toRead.filter(isRead).length, failed: skipped.length });
        return true;
      }
      try {
        await getOrFetchSource(
          ctx,
          {
            userId: run.userId,
            topicId: run.topicId,
            runId: run.id,
            url: next,
            addedBy: "search",
            maxPageChars: ctx.config.maxPageChars,
          },
          deps.calls,
        );
        have.add(urlKey(next) ?? "");
        await ctx.saveProgress({ read: toRead.filter(isRead).length, failed: skipped.length });
      } catch (err) {
        if (!(err instanceof PageReadError)) throw err;
        // Still rate limited after every retry: stop rather than skip page after page.
        if (err.status === 429 || FATAL_FIRECRAWL.test(err.message)) {
          throw new RunStepError(err.message);
        }
        console.warn(`[research] skipped ${next}: ${err.message}`);
        const [backfill, ...spares] = run.progress.spares ?? [];
        await ctx.saveProgress({
          ...(backfill ? { toRead: [...toRead, backfill], spares } : {}),
          skippedUrls: [...skipped, next],
          failed: skipped.length + 1,
          read: toRead.filter(isRead).length,
        });
      }
      return false;
    },
  };
}

const extractSchema = z.object({
  quotes: z
    .array(
      z.object({
        source: z.string(),
        quote: z.string(),
        kind: z.enum(EVIDENCE_KINDS).catch("opinion"),
        sentiment: z.number().catch(0),
        strong: z.boolean().catch(false),
        pays: z.boolean().catch(false),
        names: z.array(z.string()).catch([]),
        author: z.string().nullish(),
        date: z.string().nullish(),
      }),
    )
    .max(80),
});

const EXTRACT_INSTRUCTIONS = `You pull out what real people say about problems in a space, as exact quotes. Each part of a page is in a <document source="S1"> block; several blocks can come from the same page.

For each point a person makes about a problem, frustration, wish, workaround, price, or a product they use, copy their words exactly: one point per quote, one to three sentences, 20 to 600 characters. Never paraphrase, correct, shorten with "...", or join sentences from different places. Skip page furniture, the page owner's marketing, and anything not about the topic. A block with nothing useful gets no quotes. Give at most 5 quotes per block and 40 in all: when there are more, keep the most specific and most strongly felt.

For each quote give:
- source: the block's source label (e.g. "S1")
- kind: pain (a problem or frustration), request (something they want), workaround (how they cope today), price (what something costs or what they'd pay), competitor (a view on a named product), stat (a number about the space), opinion (anything else relevant)
- sentiment: -2 (very negative) to 2 (very positive)
- strong: true when strongly felt ("so frustrating", "dealbreaker", "switched because")
- pays: true when they mention paying, a price, a budget, or that they would pay
- names: products or companies named in the quote
- author: the handle shown with the quote, if any
- date: the date shown with the quote, if any, as YYYY-MM-DD`;

type Chunk = { source: SourceRow; text: string };

/**
 * `extract`: the code picks each page's chunks worth reading, and they are
 * sent in batches (one batch per unit). Every returned quote is checked
 * against its stored page; only quotes found there are stored, in the
 * page's own words when the match is close. Re-running a batch stores
 * nothing twice and, through the model cache, costs nothing.
 */
export function extractStep(deps: StepDeps): ResearchStep {
  return {
    name: "extract",
    async work(ctx) {
      const { run } = ctx;
      const sources = await pickedSources(ctx);
      const chunks: Chunk[] = sources.flatMap((source) =>
        selectChunks(source.markdown, run.input.seed).map((text) => ({ source, text })),
      );
      const batches = batchItems(chunks, EXTRACT_BATCH, (c) => c.text.length);
      const done = run.progress.extractBatches ?? 0;
      if (done >= batches.length) return true;

      const batch = batches[done];
      const labels = new Map<string, SourceRow>();
      const labelOf = new Map<string, string>();
      for (const { source } of batch) {
        if (labelOf.has(source.id)) continue;
        const label = `S${labelOf.size + 1}`;
        labelOf.set(source.id, label);
        labels.set(label, source);
      }
      const blocks = batch
        .map((c) => asDocument(c.text, { source: labelOf.get(c.source.id), site: c.source.site }))
        .join("\n\n");
      const output = await callModel(
        ctx,
        {
          tier: "worker",
          schema: extractSchema,
          promptVersion: EXTRACT_PROMPT_VERSION,
          instructions: EXTRACT_INSTRUCTIONS,
          prompt: `Topic: ${run.input.seed}\n\n${blocks}`,
          // 40 quotes with their fields fit; quote-dense review pages overran 3,000 (run 77cd5966).
          maxOutputTokens: 8_000,
          temperature: 0,
        },
        deps.generate,
      );

      const now = Date.now();
      const rows: EvidenceInput[] = [];
      let dropped = 0;
      for (const q of output.quotes) {
        const source = labels.get(q.source.trim().toUpperCase());
        const checked = source ? verifyQuote(q.quote, source.markdown) : null;
        if (!source || !checked) {
          dropped++;
          continue;
        }
        rows.push({
          userId: run.userId,
          topicId: run.topicId,
          sourceId: source.id,
          runId: run.id,
          quote: checked.quote,
          kind: q.kind,
          sentiment: Math.max(-2, Math.min(2, Math.round(q.sentiment))),
          strong: q.strong,
          pays: q.pays,
          names: cleanNames(q.names),
          authorKey: authorKey(source.site, q.author),
          postedAt: parsePostedAt(q.date, now) ?? source.publishedAt,
          match: checked.match,
        });
      }
      const stored = await insertEvidence(await getDb(), rows);
      await ctx.saveProgress({
        extractBatches: done + 1,
        quotes: (run.progress.quotes ?? 0) + stored,
        dropped: (run.progress.dropped ?? 0) + dropped,
      });
      return done + 1 >= batches.length;
    },
  };
}
