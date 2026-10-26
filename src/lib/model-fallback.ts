import type { LanguageModel } from "ai";

/**
 * A language model that tries a chain of models in order: the first one
 * that answers wins, and a failure (bad key, out of credit, rate limit,
 * outage) moves on to the next. The default chain is a single model
 * (DeepSeek through OpenRouter); `AI_MODELS` can add more.
 *
 * Works for `generateText` and `streamText` alike: a streaming call fails
 * over only while it is being set up (the provider's HTTP response), never
 * halfway through a reply. A model that hangs instead of failing counts as
 * failed once `attemptTimeoutMs` passes without an answer (every link but
 * the last), so one stalled provider can't stall the whole chain. Kept free
 * of SDK runtime imports so it can be unit-tested (scripts/ai.test.mjs).
 */

/** A provider model on the current (v4) spec — what both of our providers return. */
export type ProviderModel = Extract<Exclude<LanguageModel, string>, { specificationVersion: "v4" }>;
type CallOptions = Parameters<ProviderModel["doGenerate"]>[0];

export type FallbackEvent = { failed: string; next: string; error: unknown };

function isAbort(err: unknown, options: CallOptions): boolean {
  if (options.abortSignal?.aborted) return true;
  return err instanceof Error && err.name === "AbortError";
}

/** One link in the chain; `id` (e.g. `google:gemini-3.8-flash`) names it in logs and results. */
export type ChainModel = { id: string; model: ProviderModel };

type StreamResult = Awaited<ReturnType<ProviderModel["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

/**
 * Stamp the answering model's id on a stream: providers report their model
 * in `response-metadata` parts (some never do), so set it on those and add
 * one up front.
 */
function stampStream(result: StreamResult, id: string): StreamResult {
  let first = true;
  const stream = result.stream.pipeThrough(
    new TransformStream<StreamPart, StreamPart>({
      transform(part, controller) {
        if (first) {
          first = false;
          if (part.type === "stream-start") {
            controller.enqueue(part);
            controller.enqueue({ type: "response-metadata", modelId: id });
            return;
          }
          controller.enqueue({ type: "response-metadata", modelId: id });
        }
        controller.enqueue(part.type === "response-metadata" ? { ...part, modelId: id } : part);
      },
    }),
  );
  return { ...result, stream };
}

export class ModelTimeoutError extends Error {
  constructor(id: string, ms: number) {
    super(`${id} didn't answer within ${ms} ms`);
    this.name = "ModelTimeoutError";
  }
}

export function fallbackModel(
  chain: ChainModel[],
  onFallback?: (event: FallbackEvent) => void,
  { attemptTimeoutMs }: { attemptTimeoutMs?: number } = {},
): ProviderModel {
  if (!chain.length) throw new Error("fallbackModel needs at least one model.");
  const [first] = chain;

  /**
   * Run one link. Before the last, give it `attemptTimeoutMs` to answer (or,
   * for a stream, to start); the timer stops once it does, so a long reply
   * is never cut off.
   */
  async function run<T>(
    link: ChainModel,
    options: CallOptions,
    last: boolean,
    call: (link: ChainModel, options: CallOptions) => PromiseLike<T>,
  ): Promise<T> {
    if (last || !attemptTimeoutMs) return call(link, options);
    const timer = new AbortController();
    const signal = options.abortSignal
      ? AbortSignal.any([options.abortSignal, timer.signal])
      : timer.signal;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        const err = new ModelTimeoutError(link.id, attemptTimeoutMs);
        timer.abort(err);
        reject(err);
      }, attemptTimeoutMs);
    });
    const pending = Promise.resolve(call(link, { ...options, abortSignal: signal }));
    // The abandoned call rejects once aborted; that rejection is expected.
    pending.catch(() => {});
    try {
      return await Promise.race([pending, expired]);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function attempt<T>(
    options: CallOptions,
    call: (link: ChainModel, options: CallOptions) => PromiseLike<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < chain.length; i++) {
      try {
        return await run(chain[i], options, i === chain.length - 1, call);
      } catch (err) {
        if (isAbort(err, options)) throw err;
        lastError = err;
        const next = chain[i + 1];
        if (next) onFallback?.({ failed: chain[i].id, next: next.id, error: err });
      }
    }
    throw lastError;
  }

  return {
    specificationVersion: first.model.specificationVersion,
    provider: "fallback",
    modelId: chain.map((link) => link.id).join(" → "),
    supportedUrls: first.model.supportedUrls,
    doGenerate: (options) =>
      attempt(options, async ({ id, model }, opts) => {
        const result = await model.doGenerate(opts);
        return { ...result, response: { ...result.response, modelId: id } };
      }),
    doStream: (options) =>
      attempt(options, async ({ id, model }, opts) => stampStream(await model.doStream(opts), id)),
  } satisfies ProviderModel;
}

/** Trim text for a prompt, cutting at a paragraph or sentence when one is near the limit. */
export function clipText(text: string, maxChars: number): string {
  const clean = text.replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const at = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "));
  return (at > maxChars * 0.8 ? cut.slice(0, at + 1) : cut).trimEnd() + " …";
}
