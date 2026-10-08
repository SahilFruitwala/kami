import "@tanstack/react-start/server-only";
import { createGoogle } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import {
  parseModelList,
  pickModel,
  type ModelProvider,
  type TripModel,
} from "@/lib/trip-models.ts";

/**
 * The one place the trip agent's model provider is chosen. Everything else
 * works with an AI SDK `LanguageModel`, so adding a provider only touches
 * this file and `trip-models.ts`.
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
