import "@tanstack/react-start/server-only";
import { createGoogle } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import {
  DEFAULT_AI_MODELS,
  parseModelList,
  type AiModel,
  type ModelProvider,
} from "@/lib/ai-models.ts";
import { fallbackModel, type ProviderModel } from "@/lib/model-fallback.ts";

/**
 * The one place model providers are chosen. Everything else works with an
 * AI SDK `LanguageModel`, so adding a provider only touches this file and
 * `ai-models.ts`.
 */

function providerKey(provider: ModelProvider): string | null {
  const name = provider === "google" ? "GOOGLE_GENERATIVE_AI_API_KEY" : "OPENROUTER_API_KEY";
  return process.env[name]?.trim() || null;
}

const hasKey = (provider: ModelProvider) => providerKey(provider) !== null;

function languageModel(choice: AiModel): LanguageModel {
  const apiKey = providerKey(choice.provider) ?? undefined;
  if (choice.provider === "google") return createGoogle({ apiKey })(choice.model);
  return createOpenRouter({ apiKey, headers: { "X-Title": "KAMI" } })(choice.model);
}

/** `AI_MODELS` (or the default chain), keeping only providers with a key. */
function aiModelChain(): AiModel[] {
  return parseModelList(process.env.AI_MODELS, DEFAULT_AI_MODELS).filter((m) => hasKey(m.provider));
}

/** How long a model that isn't last in the chain gets to start answering. */
const AI_ATTEMPT_TIMEOUT_MS = 20_000;

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
    // A provider that hangs (seen with Gemini) must not stall the chain.
    { attemptTimeoutMs: AI_ATTEMPT_TIMEOUT_MS },
  );
}
