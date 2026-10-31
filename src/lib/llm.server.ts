import "@tanstack/react-start/server-only";
import { createGoogle } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import {
  DEFAULT_AI_MODELS,
  openrouterIgnoredProviders,
  parseModelList,
  type AiModel,
  type ModelProvider,
} from "@/lib/ai-models.ts";
import { fallbackModel, withoutReasoningOff, type ProviderModel } from "@/lib/model-fallback.ts";

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
  const ignore = openrouterIgnoredProviders(choice.model);
  return createOpenRouter({ apiKey, headers: { "X-Title": "KAMI" } })(
    choice.model,
    ignore.length ? { provider: { ignore } } : undefined,
  );
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
 * One model that tries the chain in order (by default just DeepSeek on OpenRouter),
 * or null when no provider has a key.
 */
export function aiLanguageModel(): LanguageModel | null {
  return chainModel(aiModelChain());
}

/** One model over `chain` that falls back in order; null for an empty chain. */
function chainModel(chain: AiModel[]): LanguageModel | null {
  if (!chain.length) return null;
  return fallbackModel(
    chain.map((m) => ({
      id: m.id,
      model: languageModel(m) as ProviderModel,
      // Claude through OpenRouter (`anthropic/claude-…`) can't have reasoning switched off.
      prepare:
        m.provider === "openrouter" && m.model.startsWith("anthropic/")
          ? withoutReasoningOff
          : undefined,
    })),
    ({ failed, next, error }) => {
      const e = error as { statusCode?: number; message?: string; responseBody?: string };
      // The status alone ("400") hides why; the provider's own message says.
      const why = [e?.statusCode, e?.message, e?.responseBody?.slice(0, 300)]
        .filter(Boolean)
        .join(" · ");
      console.warn(`[ai] ${failed} failed (${why || "error"}), trying ${next}`);
    },
    // A provider that hangs (seen with Gemini) must not stall the chain.
    { attemptTimeoutMs: AI_ATTEMPT_TIMEOUT_MS },
  );
}

/**
 * Research's model tiers. The worker tier (triage, extraction, matching) is
 * the `AI_MODELS` chain. The writer tier (plans, idea names, reports) is
 * `RESEARCH_WRITER_MODELS` when it names a model with a key, otherwise the
 * worker chain, so a stronger writer is something the operator opts into.
 * `id` names the chain (its model ids, comma-joined) for answer caching.
 */
export type ResearchModelTier = "worker" | "writer";

export function researchModel(
  tier: ResearchModelTier,
): { id: string; model: LanguageModel } | null {
  const worker = aiModelChain();
  const writer =
    tier === "writer"
      ? parseModelList(process.env.RESEARCH_WRITER_MODELS, "").filter((m) => hasKey(m.provider))
      : [];
  const chain = writer.length ? writer : worker;
  const model = chainModel(chain);
  return model ? { id: chain.map((m) => m.id).join(","), model } : null;
}
