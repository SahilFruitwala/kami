import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

/**
 * The narration service against Postgres, with Deepgram and R2 faked at
 * fetch: refusals cost nothing, only owners see anything, a run ends ready,
 * a failed part pauses and Resume finishes without repeating parts, and
 * deletes return unspoken allowance and clear storage.
 */

// MPEG-2 Layer III, 48 kbps, 22,050 Hz, mono: what Deepgram sends.
const FRAME_LEN = Math.floor((72 * 48_000) / 22_050);
function mp3(frames) {
  const out = new Uint8Array(FRAME_LEN * frames).fill(0x11);
  for (let i = 0; i < frames; i++) out.set([0xff, 0xf3, 0x60, 0xc0], i * FRAME_LEN);
  return out;
}

const objects = new Map();
const calls = { speak: 0 };
let failSpeakAt = -1;
let realFetch;

function fakeFetch(input, init) {
  const req = input instanceof Request ? input : new Request(input, init);
  const url = new URL(req.url);
  if (url.host === "api.deepgram.com") {
    calls.speak += 1;
    if (calls.speak === failSpeakAt) {
      return Promise.resolve(
        new Response(JSON.stringify({ err_code: "x", err_msg: "Payment required" }), {
          status: 402,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response(mp3(3), {
        headers: { "content-type": "audio/mpeg", "dg-request-id": `r${calls.speak}` },
      }),
    );
  }
  if (url.host.endsWith(".r2.cloudflarestorage.com")) {
    const key = decodeURIComponent(url.pathname.split("/").slice(2).join("/"));
    if (req.method === "PUT") {
      return req.arrayBuffer().then((body) => {
        objects.set(key, new Uint8Array(body));
        return new Response(null, { status: 200 });
      });
    }
    if (req.method === "GET") {
      const body = objects.get(key);
      return Promise.resolve(body ? new Response(body) : new Response(null, { status: 404 }));
    }
    if (req.method === "DELETE") {
      objects.delete(key);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
  }
  return realFetch(input, init);
}

const ORIGIN = "http://localhost:0";
const PARA =
  "The city council met on Tuesday to discuss the budget, and most of the people who came " +
  "were there to talk about the new library and what it would cost the town. ";
const ENGLISH = Array.from({ length: 30 }, (_, i) => `<p>${PARA}Paragraph ${i}.</p>`).join("");
const FRENCH = `<p>${"Le conseil municipal s'est réuni mardi pour discuter du budget de la ville et de la nouvelle bibliothèque. ".repeat(10)}</p>`;

describe("narration service", { skip: skipWithoutDb }, () => {
  let owner;
  let stranger;
  let svc;
  let lib;
  let ledger;
  let db;
  let sql;

  const saveArticle = async (n, html = ENGLISH) => {
    const id = `https://narration.test/${owner.id}/${n}`;
    await db.execute(sql`insert into articles (id, user_id, url, canonical_url, title, author, site_name, content_html, tidy_state)
      values (${id}, ${owner.id}, ${id}, ${id}, 'Budget night', 'Ada', 'The Ledger', ${html}, 'tidied')`);
    return id;
  };
  const balance = () => ledger.allowanceBalance(db, owner.id);
  const waitFor = async (articleId, states) => {
    for (let i = 0; i < 200; i++) {
      const view = await svc.getNarration(owner.id, articleId, ORIGIN);
      if (view && states.includes(view.state)) return view;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`narration never reached ${states}`);
  };
  const keysFor = (articleId) =>
    [...objects.keys()].filter((k) => k.includes(encodeURIComponent(articleId)));

  before(async () => {
    Object.assign(process.env, {
      DEEPGRAM_API_KEY: "test",
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "ak",
      R2_SECRET_ACCESS_KEY: "sk",
      R2_BUCKET: "narration-test",
      NARRATION_RUN_SECRET: "0123456789abcdef0123",
    });
    realFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch;
    svc = await import("@/server/services/narration");
    lib = await import("@/server/services/library");
    ledger = await import("@/lib/allowance-db.server.ts");
    db = await (await import("@/lib/db.server")).getDb();
    ({ sql } = await import("drizzle-orm"));
    owner = await testUser();
    stranger = await testUser();
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await owner?.cleanup();
    await stranger?.cleanup();
    await closeDb();
  });

  it("refuses before any speech: no allowance, then a non-English text", async () => {
    const english = await saveArticle("refusals");
    let res = await svc.startNarration(owner.id, english, ORIGIN);
    assert.equal(res.ok, false);
    assert.equal(res.refusal.code, "no_allowance");
    await ledger.grantAllowance(db, owner.id, 100_000, "test");
    const french = await saveArticle("french", FRENCH);
    res = await svc.startNarration(owner.id, french, ORIGIN);
    assert.equal(res.refusal?.code, "unsupported_language");
    assert.equal(calls.speak, 0);
  });

  it("speaks every part once, joins them, and plays only for its owner", async () => {
    const id = await saveArticle("happy");
    const before = await balance();
    const res = await svc.startNarration(owner.id, id, ORIGIN);
    assert.equal(res.ok, true);
    assert.equal((await svc.startNarration(owner.id, id, ORIGIN)).ok, true, "a second click");
    const ready = await waitFor(id, ["ready", "paused"]);
    assert.equal(ready.state, "ready");
    assert.equal(calls.speak, ready.partsTotal);
    assert.deepEqual(
      keysFor(id).map((k) => k.split("/").pop()),
      ["narration.mp3"],
    );
    assert.ok(Math.abs(ready.durationSeconds - (ready.partsTotal * 3 * 576) / 22_050) < 0.01);
    assert.equal(before - (await balance()), ready.scriptChars);

    const audio = await svc.narrationAudioUrl(owner.id, id);
    assert.match(audio.url, /X-Amz-Expires=900/);
    await assert.rejects(svc.narrationAudioUrl(stranger.id, id), { status: 404 });
    await assert.rejects(svc.startNarration(stranger.id, id, ORIGIN), { status: 404 });
    assert.equal(await svc.getNarration(stranger.id, id, ORIGIN), null);

    await svc.saveNarrationPosition(owner.id, id, 42.5);
    assert.equal((await svc.getNarration(owner.id, id, ORIGIN)).positionSeconds, 42.5);
  });

  it("pauses when Deepgram refuses, and Resume speaks only what's left", async () => {
    const id = await saveArticle("paused");
    failSpeakAt = calls.speak + 3;
    await svc.startNarration(owner.id, id, ORIGIN);
    const paused = await waitFor(id, ["paused", "ready"]);
    assert.equal(paused.state, "paused");
    assert.match(paused.pausedReason, /out of funds/);
    assert.equal(paused.partsDone, 2);
    failSpeakAt = -1;
    const before = calls.speak;
    await svc.startNarration(owner.id, id, ORIGIN);
    const done = await waitFor(id, ["ready", "paused"]);
    assert.equal(done.state, "ready");
    assert.equal(calls.speak - before, done.partsTotal - 2);
  });

  it("deleting an unfinished narration returns what it didn't speak", async () => {
    const id = await saveArticle("unfinished");
    const before = await balance();
    failSpeakAt = calls.speak + 2;
    await svc.startNarration(owner.id, id, ORIGIN);
    const paused = await waitFor(id, ["paused"]);
    failSpeakAt = -1;
    await svc.deleteNarration(owner.id, id);
    const kept = before - (await balance());
    assert.ok(kept > 0 && kept < paused.scriptChars, `kept ${kept} of ${paused.scriptChars}`);
    assert.deepEqual(keysFor(id), []);
  });

  it("deleting the article deletes its audio", async () => {
    const id = `https://narration.test/${owner.id}/happy`;
    assert.equal(keysFor(id).length, 1);
    await lib.removeLibraryItem(owner.id, id);
    assert.deepEqual(keysFor(id), []);
  });
});
