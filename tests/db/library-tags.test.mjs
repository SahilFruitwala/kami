import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { closeDb, skipWithoutDb, testUser } from "../support/db.mjs";

describe("applyTagOpEverywhere", { skip: skipWithoutDb }, () => {
  let user;
  let lib;
  const save = (n, tags) =>
    lib.upsertLibraryItem(
      user.id,
      lib.libraryItemBody.parse({
        id: `https://example.test/${user.id}/${n}`,
        url: `https://example.test/${user.id}/${n}`,
        canonicalUrl: `https://example.test/${user.id}/${n}`,
        title: `Article ${n}`,
        savedAt: Date.now() - n,
        tags,
      }),
    );
  const tagsOf = async () => {
    const page = await lib.loadLibraryPage(user.id, { limit: 50 });
    return Object.fromEntries(page.library.map((a) => [a.title, a.tags]));
  };

  before(async () => {
    lib = await import("@/server/services/library");
    user = await testUser();
    await save(1, ["Go", "ai"]);
    await save(2, ["go", "golang"]);
    await save(3, ["rust"]);
  });
  after(async () => {
    await user?.cleanup();
    await closeDb();
  });

  it("renames case-insensitively and merges into an existing tag", async () => {
    const res = await lib.applyTagOpEverywhere(user.id, { op: "rename", from: "golang", to: "go" });
    assert.deepEqual(res, { affected: 1 });
    const tags = await tagsOf();
    assert.deepEqual(tags["Article 2"], ["go"]);
    assert.deepEqual(tags["Article 1"], ["Go", "ai"]);
  });

  it("removes a tag from every article and leaves the rest alone", async () => {
    const res = await lib.applyTagOpEverywhere(user.id, { op: "remove", tag: "GO" });
    assert.deepEqual(res, { affected: 2 });
    const tags = await tagsOf();
    assert.deepEqual(tags["Article 1"], ["ai"]);
    assert.deepEqual(tags["Article 2"], []);
    assert.deepEqual(tags["Article 3"], ["rust"]);
  });

  it("only touches the caller's rows", async () => {
    const other = await testUser();
    try {
      assert.deepEqual(await lib.applyTagOpEverywhere(other.id, { op: "remove", tag: "rust" }), {
        affected: 0,
      });
      assert.deepEqual((await tagsOf())["Article 3"], ["rust"]);
    } finally {
      await other.cleanup();
    }
  });
});
