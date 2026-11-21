import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { CHARACTER_IDS, CHARACTERS, characterById, characterForSeed, isCharacterId } =
  await import("@/lib/characters");

describe("characters", () => {
  it("exports eight portraits with public avatar urls", () => {
    assert.equal(CHARACTERS.length, 8);
    assert.deepEqual(
      CHARACTERS.map((c) => c.id),
      [...CHARACTER_IDS],
    );
    for (const character of CHARACTERS) {
      assert.match(character.src, /^\/avatars\/[a-z]+\.webp$/);
      assert.equal(characterById(character.id), character);
    }
  });

  it("narrows known ids", () => {
    assert.equal(isCharacterId("kitsune"), true);
    assert.equal(isCharacterId("person"), false);
    assert.equal(isCharacterId(""), false);
  });

  it("picks a stable default from a seed", () => {
    const a = characterForSeed("user_2abc");
    const b = characterForSeed("user_2abc");
    const c = characterForSeed("user_9zzz");
    assert.equal(a, b);
    assert.equal(isCharacterId(a), true);
    assert.equal(isCharacterId(c), true);
    assert.notEqual(a, c);
  });
});
