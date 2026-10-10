import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clipText, fallbackModel, fitEmbedding } from "../src/lib/model-fallback.ts";
import {
  DEFAULT_AI_MODELS,
  DEFAULT_EMBEDDING_MODELS,
  parseModelList,
} from "../src/lib/trip-models.ts";

function fake(id, behaviour) {
  const calls = [];
  return {
    calls,
    specificationVersion: "v4",
    provider: id.split(":")[0],
    modelId: id.split(":")[1],
    supportedUrls: {},
    doGenerate: async (options) => {
      calls.push(options);
      if (behaviour instanceof Error) throw behaviour;
      return { text: behaviour };
    },
    doStream: async (options) => {
      calls.push(options);
      if (behaviour instanceof Error) throw behaviour;
      return { stream: behaviour };
    },
  };
}

describe("AI model chain", () => {
  it("defaults to Google first, then Claude Haiku", () => {
    assert.deepEqual(
      parseModelList(undefined, DEFAULT_AI_MODELS).map((m) => m.id),
      ["google:gemini-3.8-flash", "openrouter:anthropic/claude-haiku-5.5"],
    );
    assert.deepEqual(
      parseModelList("", DEFAULT_EMBEDDING_MODELS).map((m) => m.provider),
      ["google", "openrouter"],
    );
    assert.deepEqual(
      parseModelList("openrouter:x/y", DEFAULT_AI_MODELS).map((m) => m.id),
      ["openrouter:x/y"],
    );
  });

  it("uses the first model when it answers", async () => {
    const google = fake("google:g", "from google");
    const haiku = fake("openrouter:h", "from haiku");
    const model = fallbackModel([google, haiku]);
    assert.deepEqual(await model.doGenerate({}), { text: "from google" });
    assert.equal(haiku.calls.length, 0);
  });

  it("falls back to the next model on failure, for generate and stream", async () => {
    const events = [];
    const google = fake("google:g", Object.assign(new Error("quota"), { statusCode: 429 }));
    const haiku = fake("openrouter:h", "from haiku");
    const model = fallbackModel([google, haiku], (e) => events.push(e));
    assert.deepEqual(await model.doGenerate({}), { text: "from haiku" });
    assert.deepEqual(await model.doStream({}), { stream: "from haiku" });
    assert.equal(events[0].failed, "google:g");
    assert.equal(events[0].next, "openrouter:h");
  });

  it("throws the last error when every model fails", async () => {
    const model = fallbackModel([fake("a:1", new Error("one")), fake("b:2", new Error("two"))]);
    await assert.rejects(() => model.doGenerate({}), /two/);
  });

  it("does not fall back after an abort", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const haiku = fake("openrouter:h", "x");
    const model = fallbackModel([fake("google:g", new Error("aborted")), haiku]);
    await assert.rejects(() => model.doGenerate({ abortSignal: ctrl.signal }));
    assert.equal(haiku.calls.length, 0);
  });

  it("returns a single model unwrapped", () => {
    const only = fake("google:g", "x");
    assert.equal(fallbackModel([only]), only);
    assert.throws(() => fallbackModel([]));
  });
});

describe("AI text helpers", () => {
  it("fits embeddings to a unit-length prefix", () => {
    const v = fitEmbedding([3, 4, 12], 2);
    assert.deepEqual(v, [0.6, 0.8]);
    assert.throws(() => fitEmbedding([1], 2));
  });

  it("clips long text near a sentence end", () => {
    assert.equal(clipText("short", 100), "short");
    const text = "One sentence here. ".repeat(20);
    const clipped = clipText(text, 100);
    assert.ok(clipped.length <= 102);
    assert.ok(clipped.endsWith(". …"));
  });
});
