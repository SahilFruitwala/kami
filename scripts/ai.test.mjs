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
  const model = {
    specificationVersion: "v4",
    provider: id.split(":")[0],
    modelId: id.split(":")[1],
    supportedUrls: {},
    doGenerate: async (options) => {
      calls.push(options);
      if (behaviour instanceof Error) throw behaviour;
      return { text: behaviour, response: { id: "r1" } };
    },
    doStream: async (options) => {
      calls.push(options);
      if (behaviour instanceof Error) throw behaviour;
      return {
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: "stream-start", warnings: [] });
            c.enqueue({ type: "text-delta", id: "t", delta: behaviour });
            c.enqueue({ type: "response-metadata", modelId: "provider-name" });
            c.close();
          },
        }),
      };
    },
  };
  return { id, model, calls };
}

async function readAll(stream) {
  const parts = [];
  for await (const part of stream) parts.push(part);
  return parts;
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
    assert.deepEqual(await model.doGenerate({}), {
      text: "from google",
      response: { id: "r1", modelId: "google:g" },
    });
    assert.equal(haiku.calls.length, 0);
  });

  it("falls back to the next model on failure, for generate and stream", async () => {
    const events = [];
    const google = fake("google:g", Object.assign(new Error("quota"), { statusCode: 429 }));
    const haiku = fake("openrouter:h", "from haiku");
    const model = fallbackModel([google, haiku], (e) => events.push(e));
    assert.equal((await model.doGenerate({})).text, "from haiku");
    assert.equal((await model.doGenerate({})).response.modelId, "openrouter:h");
    const parts = await readAll((await model.doStream({})).stream);
    assert.deepEqual(
      parts.map((p) => [p.type, p.modelId ?? p.delta]),
      [
        ["stream-start", undefined],
        ["response-metadata", "openrouter:h"],
        ["text-delta", "from haiku"],
        ["response-metadata", "openrouter:h"],
      ],
    );
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

  it("needs at least one model", () => {
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

describe("AI chunking", async () => {
  const { chunkText, highlightChunks, highlightLine, vectorLiteral } =
    await import("../src/lib/ai-text.ts");

  it("chunks between sentences and respects limits", () => {
    const text = "Alpha one. Beta two! Gamma three? Delta four.";
    assert.deepEqual(chunkText(text, 22, 10), [
      "Alpha one. Beta two!",
      "Gamma three?",
      "Delta four.",
    ]);
    assert.deepEqual(chunkText(text, 22, 2), ["Alpha one. Beta two!", "Gamma three?"]);
    assert.deepEqual(chunkText("   ", 10, 3), []);
  });

  it("hard-cuts a run without punctuation", () => {
    const chunks = chunkText("x".repeat(25), 10, 5);
    assert.deepEqual(
      chunks.map((c) => c.length),
      [10, 10, 5],
    );
  });

  it("formats highlights with notes and groups them", () => {
    assert.equal(highlightLine({ text: " a  b ", note: "why" }), "“a b” — note: why");
    assert.equal(highlightLine({ text: "a", note: "" }), "“a”");
    const chunks = highlightChunks([{ text: "one" }, { text: "two" }, { text: "three" }], 12, 5);
    assert.deepEqual(chunks, ["“one”\n“two”", "“three”"]);
    assert.equal(highlightChunks([{ text: "one" }, { text: "two" }], 5, 1).length, 1);
  });

  it("writes pgvector literals", () => {
    assert.equal(vectorLiteral([0.5, -1, Number.NaN]), "[0.5,-1,0]");
  });
});
