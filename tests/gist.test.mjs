import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_KEY_POINTS, readStoredGist, shapeGist } from "../src/lib/gist.ts";

const folders = [
  { id: "f1", name: "Essays" },
  { id: "f2", name: "Field Notes " },
];

describe("shapeGist", () => {
  it("trims the TL;DR and key points and drops empty points", () => {
    const gist = shapeGist(
      { tldr: "  It says a thing.  ", keyPoints: [" one ", "", "   ", "two"], folder: null },
      folders,
      false,
    );
    assert.equal(gist.tldr, "It says a thing.");
    assert.deepEqual(gist.keyPoints, ["one", "two"]);
  });

  it("keeps at most six key points, in order", () => {
    const points = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const gist = shapeGist({ tldr: "t", keyPoints: points, folder: null }, folders, false);
    assert.equal(MAX_KEY_POINTS, 6);
    assert.deepEqual(gist.keyPoints, ["a", "b", "c", "d", "e", "f"]);
  });

  it("matches the suggested folder by name, ignoring case and spaces", () => {
    assert.equal(
      shapeGist({ tldr: "t", keyPoints: [], folder: " essays" }, folders, false).folderId,
      "f1",
    );
    assert.equal(
      shapeGist({ tldr: "t", keyPoints: [], folder: "field notes" }, folders, false).folderId,
      "f2",
    );
  });

  it("returns no folder when the name is unknown or missing", () => {
    assert.equal(
      shapeGist({ tldr: "t", keyPoints: [], folder: "Recipes" }, folders, false).folderId,
      null,
    );
    assert.equal(
      shapeGist({ tldr: "t", keyPoints: [], folder: null }, folders, false).folderId,
      null,
    );
    assert.equal(
      shapeGist({ tldr: "t", keyPoints: [], folder: "  " }, folders, false).folderId,
      null,
    );
  });

  it("carries the clipped flag and nothing else", () => {
    const gist = shapeGist({ tldr: "t", keyPoints: [], folder: null }, folders, true);
    assert.deepEqual(Object.keys(gist).sort(), ["clipped", "folderId", "keyPoints", "tldr"]);
    assert.equal(gist.clipped, true);
  });
});

describe("readStoredGist", () => {
  it("reads rows written before clipped existed, dropping the retired tags field", () => {
    const gist = readStoredGist({ tldr: "t", keyPoints: ["k"], tags: [], folderId: "f1" });
    assert.deepEqual(gist, { tldr: "t", keyPoints: ["k"], folderId: "f1", clipped: false });
  });

  it("survives a malformed row", () => {
    assert.deepEqual(readStoredGist(null), {
      tldr: "",
      keyPoints: [],
      folderId: null,
      clipped: false,
    });
  });
});
