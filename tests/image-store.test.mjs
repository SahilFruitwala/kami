import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { archivedImageUrl, worthArchiveRetry } from "../src/lib/fetch-image.server.ts";
import {
  articleImageTargets,
  imageKey,
  imageStoreConfig,
  loadImage,
  warmImages,
} from "../src/lib/image-store.server.ts";
import { htmlImageSources, previewImageSrc } from "../src/lib/image-url.ts";
import { memoryObjectStore } from "../src/lib/object-store.ts";
import { createR2Store } from "../src/lib/r2.server.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

/** A fake source: counts calls, answers PNG unless the URL says "missing". */
function source() {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("missing")) return { ok: false, error: "upstream 404", status: 404 };
    return { ok: true, bytes: PNG, mime: "image/png" };
  };
  return { calls, fetchImpl };
}

describe("imageStoreConfig", () => {
  const base = {
    R2_ACCOUNT_ID: "acct",
    R2_ACCESS_KEY_ID: "id",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "kami-narrations",
  };

  it("reuses narration's R2 credentials and needs no Deepgram key", () => {
    assert.deepEqual(imageStoreConfig(base), {
      accountId: "acct",
      accessKeyId: "id",
      secretAccessKey: "secret",
      bucket: "kami-narrations",
    });
  });

  it("lets R2_IMAGE_BUCKET pick a separate bucket", () => {
    assert.equal(
      imageStoreConfig({ ...base, R2_IMAGE_BUCKET: "kami-images" }).bucket,
      "kami-images",
    );
  });

  it("is off when any credential is missing", () => {
    assert.equal(imageStoreConfig({ ...base, R2_SECRET_ACCESS_KEY: " " }), null);
    assert.equal(imageStoreConfig({}), null);
  });
});

describe("imageKey", () => {
  it("hashes the target into a fixed-shape key", () => {
    const key = imageKey("https://example.com/a/../../b.png?x=1");
    assert.match(key, /^images\/[0-9a-f]{64}$/);
    assert.equal(key, imageKey("https://example.com/a/../../b.png?x=1"));
    assert.notEqual(key, imageKey("https://example.com/b.png"));
  });
});

describe("loadImage", () => {
  it("fetches once, then serves the stored copy", async () => {
    const store = memoryObjectStore();
    const { calls, fetchImpl } = source();
    const first = await loadImage(store, "https://cdn.example/a.png", { fetchImpl });
    const second = await loadImage(store, "https://cdn.example/a.png", { fetchImpl });
    assert.equal(first.ok, true);
    assert.deepEqual(second, { ok: true, bytes: PNG, mime: "image/png" });
    assert.equal(calls.length, 1);
    assert.ok(store.objects.has(imageKey("https://cdn.example/a.png")));
  });

  it("keeps serving after the source is gone", async () => {
    const store = memoryObjectStore();
    await loadImage(store, "https://cdn.example/a.png", { fetchImpl: source().fetchImpl });
    const gone = async () => ({ ok: false, error: "upstream 404", status: 404 });
    assert.equal(
      (await loadImage(store, "https://cdn.example/a.png", { fetchImpl: gone })).ok,
      true,
    );
  });

  it("stores nothing for a failed fetch", async () => {
    const store = memoryObjectStore();
    const result = await loadImage(store, "https://cdn.example/missing.png", {
      fetchImpl: source().fetchImpl,
    });
    assert.equal(result.status, 404);
    assert.equal(store.objects.size, 0);
  });

  it("never serves a stored SVG", async () => {
    const store = memoryObjectStore();
    store.objects.set(imageKey("https://cdn.example/x.png"), SVG);
    const result = await loadImage(store, "https://cdn.example/x.png", {
      fetchImpl: source().fetchImpl,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 415);
  });

  it("falls back to the source when storage fails", async () => {
    const broken = {
      ...memoryObjectStore(),
      get: async () => {
        throw new Error("R2 down");
      },
      put: async () => {
        throw new Error("R2 down");
      },
    };
    const errors = console.error;
    console.error = () => {};
    try {
      const result = await loadImage(broken, "https://cdn.example/a.png", {
        fetchImpl: source().fetchImpl,
      });
      assert.equal(result.ok, true);
    } finally {
      console.error = errors;
    }
  });

  it("serves without keeping when mayStore says no", async () => {
    const store = memoryObjectStore();
    const result = await loadImage(store, "https://cdn.example/a.png", {
      fetchImpl: source().fetchImpl,
      mayStore: async () => false,
    });
    assert.equal(result.ok, true);
    assert.equal(store.objects.size, 0);
  });

  it("asks mayStore only for a new, fetched image", async () => {
    const store = memoryObjectStore();
    let asked = 0;
    const mayStore = async () => {
      asked += 1;
      return true;
    };
    const { fetchImpl } = source();
    await loadImage(store, "https://cdn.example/missing.png", { fetchImpl, mayStore });
    await loadImage(store, "https://cdn.example/a.png", { fetchImpl, mayStore });
    await loadImage(store, "https://cdn.example/a.png", { fetchImpl, mayStore });
    assert.equal(asked, 1);
  });

  it("goes straight to the source without a store", async () => {
    const { calls, fetchImpl } = source();
    assert.equal((await loadImage(null, "https://cdn.example/a.png", { fetchImpl })).ok, true);
    assert.equal(calls.length, 1);
  });
});

describe("articleImageTargets", () => {
  it("lists hero and body images once each, as the proxy will be asked for them", () => {
    const html =
      '<p><img alt="a" src="https://cdn.example/a.png"></p>' +
      "<img src='https://cdn.example/b.png'>" +
      '<img src="data:image/png;base64,AAAA">' +
      '<img src="https://cdn.example/a.png">';
    const targets = articleImageTargets(html, "https://cdn.example/hero.jpg");
    assert.deepEqual(targets, [
      "https://cdn.example/hero.jpg",
      "https://cdn.example/a.png",
      "https://cdn.example/b.png",
    ]);
    // The same string the reader's <img> sends as `u`.
    for (const src of htmlImageSources(html).filter((s) => !s.startsWith("data:"))) {
      const u = new URL(previewImageSrc(src), "https://kami.test").searchParams.get("u");
      assert.ok(targets.includes(u));
    }
  });

  it("repairs mangled Substack URLs the same way the reader does", () => {
    const real = "https://substackcdn.com/image/fetch/w_1456/https%3A%2F%2Fx.png";
    const mangled = `https://news.example/p/fl_progressive:steep/${encodeURIComponent(real)}`;
    assert.deepEqual(articleImageTargets(`<img src="${mangled}">`), [real]);
  });
});

describe("warmImages", () => {
  it("copies missing images, skips stored ones and failures", async () => {
    const store = memoryObjectStore();
    await store.put(imageKey("https://cdn.example/old.png"), PNG, "image/png");
    const { calls, fetchImpl } = source();
    const result = await warmImages(
      store,
      [
        "https://cdn.example/old.png",
        "https://cdn.example/new.png",
        "https://cdn.example/missing.png",
      ],
      { fetchImpl },
    );
    assert.deepEqual(result, { stored: 1, present: 1, failed: 1 });
    assert.deepEqual(calls.sort(), [
      "https://cdn.example/missing.png",
      "https://cdn.example/new.png",
    ]);
    assert.ok(store.objects.has(imageKey("https://cdn.example/new.png")));
  });

  it("copies at most `limit` images", async () => {
    const store = memoryObjectStore();
    const targets = Array.from({ length: 10 }, (_, i) => `https://cdn.example/${i}.png`);
    const result = await warmImages(store, targets, { fetchImpl: source().fetchImpl, limit: 3 });
    assert.equal(result.stored, 3);
    assert.equal(store.objects.size, 3);
  });
});

describe("R2 has", () => {
  const cfg = { accountId: "acct", accessKeyId: "id", secretAccessKey: "secret", bucket: "b" };

  it("asks with HEAD and reads 404 as absent", async () => {
    const seen = [];
    const fetchImpl = async (req) => {
      seen.push(req.method);
      return new Response(null, { status: req.url.endsWith("/there") ? 200 : 404 });
    };
    const store = createR2Store(cfg, { fetchImpl, backoffMs: [0, 0] });
    assert.equal(await store.has("images/there"), true);
    assert.equal(await store.has("images/gone"), false);
    assert.deepEqual(seen, ["HEAD", "HEAD"]);
  });
});

describe("Internet Archive fallback", () => {
  const src = new URL("https://cdn.example/a.png?w=800");
  const fail = (status, error = "x") => ({ ok: false, error, status });

  it("asks the Archive for its newest raw copy", () => {
    assert.equal(
      archivedImageUrl(src.href),
      "https://web.archive.org/web/0im_/https://cdn.example/a.png?w=800",
    );
  });

  it("retries images that are gone, broken or now a page", () => {
    assert.equal(worthArchiveRetry(fail(404), src), true);
    assert.equal(worthArchiveRetry(fail(502), src), true);
    assert.equal(worthArchiveRetry(fail(415, "not an image"), src), true);
  });

  it("never retries refusals, successes or the Archive itself", () => {
    assert.equal(worthArchiveRetry(fail(400, "invalid image url"), src), false);
    assert.equal(worthArchiveRetry(fail(415, "svg images are not proxied"), src), false);
    assert.equal(worthArchiveRetry(fail(413, "image too large"), src), false);
    assert.equal(worthArchiveRetry({ ok: true, bytes: PNG, mime: "image/png" }, src), false);
    assert.equal(worthArchiveRetry(fail(404), new URL(archivedImageUrl(src.href))), false);
  });
});

describe("R2 put", () => {
  it("leaves content-length to fetch, so it is never sent twice", async () => {
    let sent;
    const fetchImpl = async (req) => {
      sent = req;
      return new Response(null, { status: 200 });
    };
    const cfg = { accountId: "acct", accessKeyId: "id", secretAccessKey: "secret", bucket: "b" };
    await createR2Store(cfg, { fetchImpl, backoffMs: [0, 0] }).put("images/x", PNG, "image/png");
    assert.equal(sent.method, "PUT");
    assert.equal(sent.headers.get("content-length"), null);
    assert.equal(sent.headers.get("content-type"), "image/png");
    assert.equal(new Uint8Array(await sent.arrayBuffer()).byteLength, PNG.byteLength);
  });
});
