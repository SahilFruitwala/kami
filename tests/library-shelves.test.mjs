import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { arrangeShelf, groupByTopic, libraryStats } from "@/lib/library-shelves";

const item = (id, over = {}) => ({
  id,
  url: `https://example.test/${id}`,
  canonicalUrl: `https://example.test/${id}`,
  title: id,
  author: "",
  siteName: "",
  source: "blog",
  wordCount: 0,
  readingMinutes: 5,
  excerpt: "",
  contentHtml: "",
  heroImage: null,
  published: null,
  savedAt: 0,
  archived: false,
  tags: [],
  folderId: null,
  highlights: [],
  favorited: false,
  note: "",
  ...over,
});

describe("groupByTopic", () => {
  it("puts every item in exactly one bucket, newest first", () => {
    const items = [
      item("a", { tags: ["ai"], savedAt: 1 }),
      item("b", { tags: ["ai"], savedAt: 3 }),
      item("c", { tags: ["cooking"], savedAt: 2 }),
      item("d"),
    ];
    const { topicById, buckets } = groupByTopic(items);
    assert.equal(topicById.size, 4);
    const all = buckets.flatMap((b) => b.items.map((i) => i.id)).sort();
    assert.deepEqual(all, ["a", "b", "c", "d"]);
    for (const b of buckets) {
      const times = b.items.map((i) => i.savedAt);
      assert.deepEqual(
        times,
        [...times].sort((x, y) => y - x),
      );
      for (const i of b.items) assert.equal(topicById.get(i.id), b.topic);
    }
  });
});

describe("arrangeShelf", () => {
  it("orders by length or recency without mutating the input", () => {
    const items = [
      item("short", { readingMinutes: 2, savedAt: 3 }),
      item("long", { readingMinutes: 30, savedAt: 1 }),
    ];
    const { topicById } = groupByTopic(items);
    assert.deepEqual(
      arrangeShelf(items, "length", topicById).map((i) => i.id),
      ["long", "short"],
    );
    assert.deepEqual(
      arrangeShelf(items, "recent", topicById).map((i) => i.id),
      ["short", "long"],
    );
    assert.equal(items[0].id, "short");
  });
});

describe("libraryStats", () => {
  it("counts unread minutes and highlighted unread works", () => {
    const stats = libraryStats([
      item("a", { readingMinutes: 10, highlights: [{ id: "h" }] }),
      item("b", { readingMinutes: 20, archived: true, highlights: [{ id: "h" }] }),
      item("c", { readingMinutes: 5 }),
    ]);
    assert.equal(stats.minutes, 15);
    assert.equal(stats.inProgress, 1);
  });
});
