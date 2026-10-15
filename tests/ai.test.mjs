import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clipText, fallbackModel } from "../src/lib/model-fallback.ts";
import { DEFAULT_AI_MODELS, parseModelList } from "../src/lib/ai-models.ts";

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
  it("clips long text near a sentence end", () => {
    assert.equal(clipText("short", 100), "short");
    const text = "One sentence here. ".repeat(20);
    const clipped = clipText(text, 100);
    assert.ok(clipped.length <= 102);
    assert.ok(clipped.endsWith(". …"));
  });
});

describe("tidy blocks", async () => {
  const { joinBlocks, splitBlocks } = await import("../src/lib/tidy-html.server.ts");

  it("descends through lone wrappers and numbers top-level blocks", () => {
    const html =
      "<div><table><tbody><tr><td><p>Hello there</p><p>Sponsored by <a href='x'>Acme</a></p>tail text</td></tr></tbody></table></div>";
    const { blocks, previews } = splitBlocks(html);
    assert.equal(blocks.length, 3);
    assert.match(previews[1], /^<p> Sponsored by Acme \[1 link\]$/);
    assert.equal(blocks[2], "<p>tail text</p>");
    assert.equal(joinBlocks(blocks, new Set([1])), "<p>Hello there</p>\n<p>tail text</p>");
  });

  it("keeps a lone content block whole", () => {
    const { blocks } = splitBlocks("<blockquote><p>a</p><p>b</p></blockquote>");
    assert.equal(blocks.length, 1);
  });
});

describe("content blocks", async () => {
  const { collectContentBlocks, joinContentBlocks } =
    await import("../src/lib/tidy-html.server.ts");

  it("collects readable blocks in order, skipping chrome and nested blocks", () => {
    const html = `<html><head><title> A  Page </title><script>x()</script></head><body>
      <nav><p>Home</p></nav>
      <div><h1>Title</h1><p>First <b>para</b>.</p><blockquote><p>Quoted</p></blockquote>
      <ul><li>One</li><li>Two</li></ul><p>   </p></div><footer><p>© me</p></footer></body></html>`;
    const { title, blocks, previews } = collectContentBlocks(html);
    assert.equal(title, "A Page");
    assert.deepEqual(
      blocks.map((b) => b.tag),
      ["h1", "p", "blockquote", "li", "li"],
    );
    assert.equal(previews[1], "<p> First para.");
    assert.equal(
      joinContentBlocks(blocks.slice(2)),
      "<blockquote><p>Quoted</p></blockquote>\n<ul><li>One</li><li>Two</li></ul>",
    );
  });
});
