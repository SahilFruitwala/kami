import "@tanstack/react-start/server-only";
import { createGoogle } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { EmbeddingModel, LanguageModel } from "ai";
import { fallbackModel, type ProviderModel } from "@/lib/model-fallback.ts";
import {
  DEFAULT_AI_MODELS,
  DEFAULT_EMBEDDING_MODELS,
  parseModelList,
  pickModel,
  type ModelProvider,
  type TripModel,
} from "@/lib/trip-models.ts";

/**
 * The one place model providers are chosen (the trip agent's picker and the
 * library's AI features). Everything else works with an AI SDK
 * `LanguageModel`, so adding a provider only touches this file and
 * `trip-models.ts`.
 */

function providerKey(provider: ModelProvider): string | null {
  const name = provider === "google" ? "GOOGLE_GENERATIVE_AI_API_KEY" : "OPENROUTER_API_KEY";
  return process.env[name]?.trim() || null;
}

const hasKey = (provider: ModelProvider) => providerKey(provider) !== null;

/** Models offered in the picker, each marked usable or not. */
export function tripModelMenu(): Array<TripModel & { available: boolean }> {
  return parseModelList(process.env.TRIPS_MODELS).map((m) => ({
    ...m,
    available: hasKey(m.provider),
  }));
}

/** The model for a request (falls back to the default), or null when no provider has a key. */
export function resolveTripModel(requested?: string | null): TripModel | null {
  return pickModel(parseModelList(process.env.TRIPS_MODELS), hasKey, requested);
}

export function languageModel(choice: TripModel): LanguageModel {
  const apiKey = providerKey(choice.provider) ?? undefined;
  if (choice.provider === "google") return createGoogle({ apiKey })(choice.model);
  return createOpenRouter({ apiKey, headers: { "X-Title": "KAMI" } })(choice.model);
}

// ---------- Library AI features ----------

/** `AI_MODELS` (or the default chain), keeping only providers with a key. */
function aiModelChain(): TripModel[] {
  return parseModelList(process.env.AI_MODELS, DEFAULT_AI_MODELS).filter((m) => hasKey(m.provider));
}

/** True when at least one model in the AI chain is usable. */
export const aiConfigured = () => aiModelChain().length > 0;

/**
 * One model that tries the chain in order (Google first, then Claude Haiku),
 * or null when no provider has a key.
 */
export function aiLanguageModel(): LanguageModel | null {
  const chain = aiModelChain();
  if (!chain.length) return null;
  return fallbackModel(
    chain.map((m) => ({ id: m.id, model: languageModel(m) as ProviderModel })),
    ({ failed, next, error }) => {
      const e = error as { statusCode?: number; message?: string };
      console.warn(
        `[ai] ${failed} failed (${e?.statusCode ?? e?.message ?? "error"}), trying ${next}`,
      );
    },
  );
}

/** Embedding models in fallback order (all serving one model family). */
export function aiEmbeddingModels(): Array<{ id: string; model: EmbeddingModel }> {
  return parseModelList(process.env.AI_EMBEDDING_MODELS, DEFAULT_EMBEDDING_MODELS)
    .filter((m) => hasKey(m.provider))
    .map((m) => {
      const apiKey = providerKey(m.provider) ?? undefined;
      const model =
        m.provider === "google"
          ? createGoogle({ apiKey }).embedding(m.model)
          : createOpenRouter({ apiKey, headers: { "X-Title": "KAMI" } }).textEmbeddingModel(
              m.model,
            );
      return { id: m.id, model: model as EmbeddingModel };
    });
}
