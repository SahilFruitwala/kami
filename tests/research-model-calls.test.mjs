import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { batchItems, estimateTokens, modelCacheKey } from "../src/lib/research/model-calls.ts";

describe("batchItems", () => {
  const size = (s) => s.length;

  it("packs in order up to the item and character limits", () => {
    assert.deepEqual(batchItems(["a", "b", "c", "d", "e"], { maxItems: 2, maxChars: 100 }, size), [
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
    assert.deepEqual(batchItems(["aaaa", "bbbb", "cc"], { maxItems: 10, maxChars: 6 }, size), [
      ["aaaa"],
      ["bbbb", "cc"],
    ]);
  });

  it("gives an oversized item a batch of its own instead of dropping it", () => {
    assert.deepEqual(batchItems(["a", "x".repeat(20), "b"], { maxItems: 10, maxChars: 5 }, size), [
      ["a"],
      ["x".repeat(20)],
      ["b"],
    ]);
  });

  it("returns no batches for no items", () => {
    assert.deepEqual(batchItems([], { maxItems: 2, maxChars: 10 }, size), []);
  });
});

describe("modelCacheKey", () => {
  it("is the same for the same input whatever the key order", () => {
    assert.equal(
      modelCacheKey("m", "v1", { prompt: "p", maxOutputTokens: 10 }),
      modelCacheKey("m", "v1", { maxOutputTokens: 10, prompt: "p" }),
    );
  });

  it("changes with the model chain, the prompt version or the input", () => {
    const base = modelCacheKey("m", "v1", { prompt: "p" });
    assert.notEqual(modelCacheKey("m2", "v1", { prompt: "p" }), base);
    assert.notEqual(modelCacheKey("m", "v2", { prompt: "p" }), base);
    assert.notEqual(modelCacheKey("m", "v1", { prompt: "q" }), base);
  });
});

describe("estimateTokens", () => {
  it("errs high (about 3 characters per token)", () => {
    assert.equal(estimateTokens(""), 0);
    assert.equal(estimateTokens("abcd"), 2);
    assert.equal(estimateTokens("x".repeat(3000)), 1000);
  });
});

describe("research model tiers", () => {
  const saved = {};
  const keys = [
    "OPENROUTER_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "AI_MODELS",
    "RESEARCH_WRITER_MODELS",
  ];
  let researchModel;

  before(async () => {
    for (const k of keys) saved[k] = process.env[k];
    ({ researchModel } = await import("../src/lib/llm.server.ts"));
  });

  after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const set = (env) => {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, env);
  };

  it("is off with no provider key", () => {
    set({});
    assert.equal(researchModel("worker"), null);
    assert.equal(researchModel("writer"), null);
  });

  it("writes with the worker chain unless a writer chain is configured", () => {
    set({ OPENROUTER_API_KEY: "k" });
    const worker = researchModel("worker").id;
    assert.match(worker, /^openrouter:/);
    assert.equal(researchModel("writer").id, worker);

    set({
      OPENROUTER_API_KEY: "k",
      RESEARCH_WRITER_MODELS: "openrouter:anthropic/claude-sonnet-5.5",
    });
    assert.equal(researchModel("writer").id, "openrouter:anthropic/claude-sonnet-5.5");
    assert.equal(researchModel("worker").id, worker);
  });

  it("falls back to the worker chain when the writer's provider has no key", () => {
    set({ OPENROUTER_API_KEY: "k", RESEARCH_WRITER_MODELS: "google:gemini-3.8-pro" });
    assert.equal(researchModel("writer").id, researchModel("worker").id);
  });
});
