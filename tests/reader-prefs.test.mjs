import assert from "node:assert/strict";
import { describe, it } from "node:test";

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
};
globalThis.localStorage = localStorage;
globalThis.window ??= { localStorage, addEventListener() {} };

// Preferences saved by the old library store (same key and version).
store.set(
  "quarto-library",
  JSON.stringify({
    version: 10,
    state: {
      openId: "gone",
      readerFontSize: 4,
      readerFont: "literata",
      highlightColor: "bamboo",
      paperTone: "aged",
      preferredLightTone: "aged",
      progressById: { a: 0.5 },
      resumeEnabled: false,
      autoOrganize: false,
    },
  }),
);

const { useReaderPrefs } = await import("@/lib/reader-prefs");

describe("useReaderPrefs", () => {
  it("loads preferences the library store saved", () => {
    const s = useReaderPrefs.getState();
    assert.equal(s.readerFontSize, 4);
    assert.equal(s.readerFont, "literata");
    assert.equal(s.highlightColor, "bamboo");
    assert.equal(s.paperTone, "aged");
    assert.deepEqual(s.progressById, { a: 0.5 });
    assert.equal(s.resumeEnabled, false);
    assert.equal(s.autoOrganize, false);
  });

  it("migrates older saved versions", async () => {
    store.set(
      "quarto-library",
      JSON.stringify({ version: 3, state: { readerSize: "lg", readerFont: "nope" } }),
    );
    await useReaderPrefs.persist.rehydrate();
    const s = useReaderPrefs.getState();
    assert.equal(s.readerFontSize, 3);
    assert.equal(s.readerFont, "newsreader");
  });

  it("clamps sizes and remembers the light paper", () => {
    const s = useReaderPrefs.getState();
    s.setReaderFontSize(99);
    assert.equal(useReaderPrefs.getState().readerFontSize, 6);
    s.setPaperTone("aged");
    s.setPaperTone("sumi");
    assert.equal(useReaderPrefs.getState().preferredLightTone, "aged");
    assert.ok(!JSON.parse(store.get("quarto-library")).state.openId, "dead openId not re-saved");
  });
});
