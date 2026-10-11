/**
 * The trip agent's model menu, as `provider:model` ids.
 *
 * `TRIPS_MODELS` (comma-separated) overrides the default list; the first
 * entry whose provider has a key is the default. Kept free of SDK / framework
 * imports so it can be unit-tested (scripts/trip-agent.test.mjs).
 */

export const MODEL_PROVIDERS = ["google", "openrouter"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

/** Google first: it is the default when its key is set. */
export const DEFAULT_TRIP_MODELS = "google:gemini-3.8-flash,openrouter:anthropic/claude-haiku-5.5";

/**
 * The fallback chain for the library's AI features (summaries, tags, chat,
 * digests…): Google first, Claude Haiku through OpenRouter when Google fails
 * or has no key. `AI_MODELS` overrides it.
 */
export const DEFAULT_AI_MODELS = DEFAULT_TRIP_MODELS;

/**
 * Embedding models for semantic search, in fallback order. Both serve the same
 * Gemini model, so vectors from either one are comparable. `AI_EMBEDDING_MODELS`
 * overrides it (keep every entry on one model family, or re-index after a change).
 */
export const DEFAULT_EMBEDDING_MODELS =
  "google:gemini-embedding-001,openrouter:google/gemini-embedding-001";

export type TripModel = {
  /** `provider:model`, e.g. `google:gemini-3.8-flash`. */
  id: string;
  provider: ModelProvider;
  /** The provider's own model name, e.g. `anthropic/claude-haiku-5.5`. */
  model: string;
  label: string;
};

const PROVIDER_LABEL: Record<ModelProvider, string> = {
  google: "Google",
  openrouter: "OpenRouter",
};

/** Parse one `provider:model` id; null when the provider is unknown or the model is blank. */
export function parseModelId(raw: string): TripModel | null {
  const value = raw.trim();
  const colon = value.indexOf(":");
  if (colon <= 0) return null;
  const provider = value.slice(0, colon).toLowerCase();
  const model = value.slice(colon + 1).trim();
  if (!model || !(MODEL_PROVIDERS as readonly string[]).includes(provider)) return null;
  const p = provider as ModelProvider;
  return { id: `${p}:${model}`, provider: p, model, label: `${model} · ${PROVIDER_LABEL[p]}` };
}

/** Parse a comma-separated list, dropping invalid and duplicate entries. */
export function parseModelList(
  raw: string | undefined,
  fallback: string = DEFAULT_TRIP_MODELS,
): TripModel[] {
  const source = raw?.trim() ? raw : fallback;
  const seen = new Set<string>();
  const models: TripModel[] = [];
  for (const part of source.split(",")) {
    const parsed = parseModelId(part);
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      models.push(parsed);
    }
  }
  return models;
}

/**
 * Pick the model for one request: the requested id when it is on the menu
 * and usable, otherwise the first usable model, otherwise null.
 */
export function pickModel(
  models: TripModel[],
  usable: (provider: ModelProvider) => boolean,
  requested?: string | null,
): TripModel | null {
  const available = models.filter((m) => usable(m.provider));
  return available.find((m) => m.id === requested) ?? available[0] ?? null;
}
