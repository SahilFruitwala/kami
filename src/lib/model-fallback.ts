import type { LanguageModel } from "ai";

/**
 * A language model that tries a chain of models in order: the first one
 * that answers wins, and a failure (bad key, out of credit, rate limit,
 * outage) moves on to the next. With the default chain that is Google
 * first, then Claude Haiku through OpenRouter.
 *
 * Works for `generateText` and `streamText` alike: a streaming call fails
 * over only while it is being set up (the provider's HTTP response), never
 * halfway through a reply. Kept free of SDK runtime imports so it can be
 * unit-tested (scripts/ai.test.mjs).
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

export function fallbackModel(
  chain: ChainModel[],
  onFallback?: (event: FallbackEvent) => void,
): ProviderModel {
  if (!chain.length) throw new Error("fallbackModel needs at least one model.");
  const [first] = chain;

  async function attempt<T>(
    options: CallOptions,
    call: (link: ChainModel) => PromiseLike<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < chain.length; i++) {
      try {
        return await call(chain[i]);
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
      attempt(options, async ({ id, model }) => {
        const result = await model.doGenerate(options);
        return { ...result, response: { ...result.response, modelId: id } };
      }),
    doStream: (options) =>
      attempt(options, async ({ id, model }) => stampStream(await model.doStream(options), id)),
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
