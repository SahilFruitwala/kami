import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const mem = new Map();
const localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
};
globalThis.localStorage = localStorage;
globalThis.window ??= { localStorage, addEventListener() {} };
globalThis.document ??= { addEventListener() {}, visibilityState: "visible" };
// Skip the one-time legacy import.
mem.set("quarto-library-migrated-v1", "1");

const item = (n) => ({
  id: `a${n}`,
  url: `https://example.test/${n}`,
  canonicalUrl: `https://example.test/${n}`,
  title: `A${n}`,
  author: "",
  siteName: "",
  source: "blog",
  wordCount: 0,
  readingMinutes: 1,
  excerpt: "",
  contentHtml: "",
  heroImage: null,
  published: null,
  savedAt: 1000 - n,
  archived: false,
  tags: [],
  folderId: null,
  highlights: [],
  favorited: false,
  note: "",
});

/** Serves /api/library pages of 2 from `total` items; `gate` can hold a response. */
let total = 5;
let gate = null;
globalThis.fetch = async (url) => {
  if (gate) await gate;
  const u = new URL(url, "https://kami.test");
  const after = u.searchParams.get("cursorId");
  const all = Array.from({ length: total }, (_, i) => item(i));
  const start = after ? all.findIndex((a) => a.id === after) + 1 : 0;
  const page = all.slice(start, start + 2);
  const last = page.at(-1);
  const more = start + 2 < all.length;
  return Response.json({
    library: page,
    folders: start === 0 ? [{ id: "f1", name: "Reading" }] : [],
    nextCursor: more ? { savedAt: last.savedAt, id: last.id } : null,
    total: start === 0 ? total : null,
  });
};

const { useLibraryStore } = await import("@/lib/store");
const remote = await import("@/lib/library-remote");
const settle = () => new Promise((r) => setTimeout(r, 20));

describe("library boot", () => {
  beforeEach(() => {
    remote.clearLibraryLocal();
    gate = null;
  });

  it("shows the first page, then streams the rest in", async () => {
    await remote.bootstrapLibraryFromServer("u1");
    let s = useLibraryStore.getState();
    assert.equal(s.libraryTotal, 5);
    assert.deepEqual(s.folders, [{ id: "f1", name: "Reading" }]);
    await settle();
    s = useLibraryStore.getState();
    assert.deepEqual(
      s.library.map((a) => a.id),
      ["a0", "a1", "a2", "a3", "a4"],
    );
    assert.equal(s.libraryComplete, true);
  });

  it("drops a boot that finishes after sign-out", async () => {
    let release;
    gate = new Promise((r) => (release = r));
    const boot = remote.bootstrapLibraryFromServer("u1");
    remote.clearLibraryLocal();
    release();
    await boot;
    await settle();
    assert.deepEqual(useLibraryStore.getState().library, []);
    assert.equal(useLibraryStore.getState().libraryTotal, null);
  });

  it("stops background paging after sign-out", async () => {
    await remote.bootstrapLibraryFromServer("u1");
    remote.clearLibraryLocal();
    await settle();
    assert.deepEqual(useLibraryStore.getState().library, []);
  });
});
