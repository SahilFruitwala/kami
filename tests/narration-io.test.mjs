import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APICallError, RetryError } from "ai";
import { audioFrames, joinMp3, readFrameHeader } from "../src/lib/mp3.ts";
import { narrationConfig } from "../src/lib/narration-config.server.ts";
import { memoryObjectStore, narrationKeys } from "../src/lib/object-store.ts";
import { createR2Store, r2Host, r2ObjectUrl } from "../src/lib/r2.server.ts";
import {
  NARRATION_MODEL,
  SpeechError,
  classifySpeechError,
  speakPart,
} from "../src/lib/speech.server.ts";

// ---------- synthetic MP3 ----------

// MPEG-2 Layer III, 48 kbps, 22,050 Hz, mono, no CRC: what Deepgram sends.
const FRAME_LEN = Math.floor((72 * 48_000) / 22_050); // 156 bytes, 576 samples

function frame(fill = 0x11, tag = "") {
  const f = new Uint8Array(FRAME_LEN).fill(fill);
  f.set([0xff, 0xf3, 0x60, 0xc0]);
  for (let i = 0; i < tag.length; i++) f[13 + i] = tag.charCodeAt(i);
  return f;
}

function id3v2(payload = 20) {
  const tag = new Uint8Array(10 + payload);
  tag.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, payload]);
  return tag;
}

const concat = (...chunks) => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
};

describe("mp3", () => {
  it("reads Deepgram's frame header", () => {
    assert.deepEqual(readFrameHeader(frame(), 0), {
      length: FRAME_LEN,
      samples: 576,
      sampleRate: 22_050,
    });
    assert.equal(readFrameHeader(new Uint8Array([0, 1, 2, 3]), 0), null);
  });

  it("skips an ID3v2 tag and a leading Xing/Info frame", () => {
    const part = concat(id3v2(), frame(0x22, "Info"), frame(), frame());
    const frames = audioFrames(part);
    assert.equal(frames.length, 2);
    assert.equal(frames[0].offset, 30 + FRAME_LEN);
  });

  it("drops a trailing ID3v1 tag", () => {
    const v1 = new Uint8Array(128);
    v1.set([0x54, 0x41, 0x47]);
    assert.equal(audioFrames(concat(frame(), frame(), v1)).length, 2);
  });

  it("joins parts into one stream of audio frames with a counted duration", () => {
    const a = concat(id3v2(), frame(0x22, "Xing"), frame(0x01), frame(0x02));
    const b = concat(id3v2(), frame(0x22, "Info"), frame(0x03));
    const joined = joinMp3([a, b]);
    assert.equal(joined.frames, 3);
    assert.equal(joined.bytes.length, 3 * FRAME_LEN);
    assert.deepEqual(
      [joined.bytes[4], joined.bytes[FRAME_LEN + 4], joined.bytes[2 * FRAME_LEN + 4]],
      [0x01, 0x02, 0x03],
    );
    assert.ok(Math.abs(joined.durationSeconds - (3 * 576) / 22_050) < 1e-9);
    // The joined file has no header frame or tag left for a browser to misread.
    assert.equal(audioFrames(joined.bytes).length, 3);
    assert.notEqual(joined.bytes[0], 0x49);
  });

  it("resyncs past junk between frames", () => {
    const junk = new Uint8Array([1, 2, 3, 0xff, 0x00]);
    assert.equal(audioFrames(concat(frame(), junk, frame())).length, 2);
  });
});

// ---------- config ----------

const ENV = {
  DEEPGRAM_API_KEY: "dg",
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "ak",
  R2_SECRET_ACCESS_KEY: "sk",
  R2_BUCKET: "kami-narrations",
  NARRATION_RUN_SECRET: "0123456789abcdef",
};

describe("narrationConfig", () => {
  it("is on only when Deepgram, R2 and a long-enough run secret are all set", () => {
    assert.ok(narrationConfig(ENV));
    for (const key of Object.keys(ENV)) {
      assert.equal(narrationConfig({ ...ENV, [key]: "" }), null, `${key} missing`);
    }
    assert.equal(narrationConfig({ ...ENV, NARRATION_RUN_SECRET: "short" }), null);
  });

  it("picks up Vercel's protection bypass secret when present", () => {
    assert.equal(narrationConfig(ENV).protectionBypass, null);
    assert.equal(
      narrationConfig({ ...ENV, VERCEL_AUTOMATION_BYPASS_SECRET: "bypass" }).protectionBypass,
      "bypass",
    );
  });
});

// ---------- object store ----------

describe("object store", () => {
  it("lays out predictable keys per narration", () => {
    const keys = narrationKeys("user_1", "https://x.com/a b", "n1");
    assert.equal(keys.part(0), "narrations/user_1/https%3A%2F%2Fx.com%2Fa%20b/n1/part-0001.mp3");
    assert.equal(keys.audio, "narrations/user_1/https%3A%2F%2Fx.com%2Fa%20b/n1/narration.mp3");
  });

  it("builds R2 object URLs on the account's S3 host", () => {
    assert.equal(r2Host("acct"), "acct.r2.cloudflarestorage.com");
    assert.equal(
      r2ObjectUrl({ accountId: "acct", bucket: "b" }, "narrations/u/a%2Fb/n/narration.mp3"),
      "https://acct.r2.cloudflarestorage.com/b/narrations/u/a%252Fb/n/narration.mp3",
    );
  });

  it("presigns a GET for exactly one object, with the expiry asked for", async () => {
    const store = createR2Store({
      accountId: "acct",
      accessKeyId: "AKID",
      secretAccessKey: "secret",
      bucket: "b",
    });
    const url = new URL(await store.presignGet("narrations/u/a/n/narration.mp3", 900));
    assert.equal(url.host, "acct.r2.cloudflarestorage.com");
    assert.equal(url.pathname, "/b/narrations/u/a/n/narration.mp3");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
    assert.equal(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256");
    assert.match(url.searchParams.get("X-Amz-Credential"), /^AKID\/\d{8}\/auto\/s3\/aws4_request$/);
    assert.match(url.searchParams.get("X-Amz-Signature"), /^[0-9a-f]{64}$/);
  });

  it("signs PUT/GET/DELETE and maps 404 to null", async () => {
    const seen = [];
    const fake = async (req) => {
      seen.push([req.method, new URL(req.url).pathname, req.headers.get("authorization")]);
      if (req.method === "GET") return new Response(null, { status: 404 });
      return new Response(null, { status: 200 });
    };
    const store = createR2Store(
      { accountId: "acct", accessKeyId: "AKID", secretAccessKey: "secret", bucket: "b" },
      { fetchImpl: fake },
    );
    await store.put("k/one.mp3", new Uint8Array([1, 2]), "audio/mpeg");
    assert.equal(await store.get("k/one.mp3"), null);
    await store.delete("k/one.mp3");
    assert.deepEqual(
      seen.map(([m, p]) => [m, p]),
      [
        ["PUT", "/b/k/one.mp3"],
        ["GET", "/b/k/one.mp3"],
        ["DELETE", "/b/k/one.mp3"],
      ],
    );
    assert.ok(seen.every(([, , auth]) => auth?.startsWith("AWS4-HMAC-SHA256 Credential=AKID/")));
  });

  it("retries R2's occasional 500 and gives up after three tries", async () => {
    const cfg = { accountId: "acct", accessKeyId: "AKID", secretAccessKey: "secret", bucket: "b" };
    let calls = 0;
    const flaky = createR2Store(cfg, {
      backoffMs: [0, 0],
      fetchImpl: async () => new Response(null, { status: ++calls < 3 ? 500 : 200 }),
    });
    await flaky.put("k", new Uint8Array([1]), "audio/mpeg");
    assert.equal(calls, 3);

    calls = 0;
    const down = createR2Store(cfg, {
      backoffMs: [0, 0],
      fetchImpl: async () => {
        calls += 1;
        return new Response("<Error/>", { status: 500 });
      },
    });
    await assert.rejects(down.put("k", new Uint8Array([1]), "audio/mpeg"), /500/);
    assert.equal(calls, 3);

    calls = 0;
    const missing = createR2Store(cfg, {
      backoffMs: [0, 0],
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 404 });
      },
    });
    assert.equal(await missing.get("k"), null);
    assert.equal(calls, 1, "a 404 is an answer, not a failure");
  });

  it("has an in-memory twin for tests", async () => {
    const store = memoryObjectStore();
    await store.put("a", new Uint8Array([7]), "audio/mpeg");
    assert.deepEqual([...(await store.get("a"))], [7]);
    await store.delete("a");
    assert.equal(await store.get("a"), null);
  });
});

// ---------- speech ----------

function fakeSpeech(behaviour) {
  const calls = [];
  return {
    calls,
    model: {
      specificationVersion: "v4",
      provider: "deepgram",
      modelId: NARRATION_MODEL,
      doGenerate: async (options) => {
        calls.push(options);
        if (behaviour instanceof Error) throw behaviour;
        return {
          audio: frame(),
          warnings: [],
          response: {
            timestamp: new Date(),
            modelId: NARRATION_MODEL,
            headers: { "dg-request-id": "req-1" },
          },
          providerMetadata: { deepgram: { charCount: 42 } },
        };
      },
    },
  };
}

const apiError = (statusCode) =>
  new APICallError({
    message: `status ${statusCode}`,
    url: "https://api.deepgram.com/v1/speak",
    requestBodyValues: {},
    statusCode,
    isRetryable: statusCode === 429 || statusCode >= 500,
  });

describe("speech", () => {
  it("speaks a part as mp3 at 48 kbps and reports billed characters", async () => {
    const { model, calls } = fakeSpeech();
    const spoken = await speakPart(model, "Hello there.");
    assert.equal(spoken.audio.length, FRAME_LEN);
    assert.equal(spoken.chars, 42);
    assert.equal(spoken.requestId, "req-1");
    assert.equal(calls[0].text, "Hello there.");
    assert.deepEqual(calls[0].providerOptions.deepgram, { encoding: "mp3", bitRate: 48000 });
  });

  it("pauses for good on a bad key, no funds or no permission", () => {
    for (const status of [401, 402, 403]) {
      const err = classifySpeechError(apiError(status));
      assert.equal(err.kind, "permanent", String(status));
      assert.equal(err.status, status);
    }
    assert.match(classifySpeechError(apiError(402)).message, /out of funds/);
  });

  it("treats a request we built wrong as permanent too", () => {
    assert.equal(classifySpeechError(apiError(413)).kind, "permanent");
    assert.equal(classifySpeechError(apiError(400)).kind, "permanent");
  });

  it("treats rate limits, timeouts and outages as transient, even after a retry", () => {
    for (const status of [408, 429, 500, 503]) {
      assert.equal(classifySpeechError(apiError(status)).kind, "transient", String(status));
    }
    const retried = new RetryError({
      message: "failed after retries",
      reason: "maxRetriesExceeded",
      errors: [apiError(503), apiError(402)],
    });
    assert.equal(classifySpeechError(retried).kind, "permanent");
    assert.equal(classifySpeechError(new Error("socket hang up")).kind, "transient");
  });

  it("throws a classified error from a failing call", async () => {
    const { model } = fakeSpeech(apiError(402));
    await assert.rejects(
      speakPart(model, "Hi."),
      (err) => err instanceof SpeechError && err.kind === "permanent",
    );
  });
});
