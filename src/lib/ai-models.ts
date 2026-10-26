/**
 * The model chain for the library's AI features, as `provider:model` ids.
 *
 * `AI_MODELS` (comma-separated) overrides the default list; the first entry
 * whose provider has a key answers, and a failure moves on to the next. Kept
 * free of SDK / framework imports so it can be unit-tested (scripts/ai.test.mjs).
 */

export const MODEL_PROVIDERS = ["google", "openrouter"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

/** DeepSeek through OpenRouter. Add more entries via `AI_MODELS` for a fallback chain. */
export const DEFAULT_AI_MODELS = "openrouter:deepseek/deepseek-v4.1-flash-1017";

export type AiModel = {
  /** `provider:model`, e.g. `google:gemini-3.8-flash`. */
  id: string;
  provider: ModelProvider;
  /** The provider's own model name, e.g. `deepseek/deepseek-v4.1-flash-1017`. */
  model: string;
  label: string;
};

const PROVIDER_LABEL: Record<ModelProvider, string> = {
  google: "Google",
  openrouter: "OpenRouter",
};

/** Parse one `provider:model` id; null when the provider is unknown or the model is blank. */
export function parseModelId(raw: string): AiModel | null {
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
  fallback: string = DEFAULT_AI_MODELS,
): AiModel[] {
  const source = raw?.trim() ? raw : fallback;
  const seen = new Set<string>();
  const models: AiModel[] = [];
  for (const part of source.split(",")) {
    const parsed = parseModelId(part);
    if (parsed && !seen.has(parsed.id)) {
      seen.add(parsed.id);
      models.push(parsed);
    }
  }
  return models;
}
