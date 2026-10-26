import { createHash } from "node:crypto";

/**
 * Pure helpers for Research's model calls: packing items into batched calls,
 * the answer-cache key, and the token estimate used for budget checks.
 * Tested in tests/research-model-calls.test.mjs.
 */

/**
 * Pack items, in order, into batches of at most `maxItems` items and
 * `maxChars` characters (by `size`). An item bigger than `maxChars` gets a
 * batch of its own rather than being dropped.
 */
export function batchItems<T>(
  items: T[],
  limits: { maxItems: number; maxChars: number },
  size: (item: T) => number,
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let chars = 0;
  for (const item of items) {
    const n = size(item);
    if (current.length && (current.length >= limits.maxItems || chars + n > limits.maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += n;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** JSON with object keys sorted, so equal inputs always hash the same. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The answer-cache key: sha256 of the model chain, the prompt's version and
 * everything sent. Changing any of them (a new prompt version, a different
 * writer model) misses the cache instead of returning a stale answer.
 */
export function modelCacheKey(modelId: string, promptVersion: string, input: unknown): string {
  return createHash("sha256")
    .update(`${modelId}\n${promptVersion}\n${stableJson(input)}`)
    .digest("hex");
}

/**
 * A deliberately high token estimate for text about to be sent (about 3
 * characters per token; real English is nearer 4), so the budget check
 * before a call errs toward refusing rather than overspending.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}
