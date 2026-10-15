import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadDotenv, parseDotenv, readDotenvFile } from "../scripts/load-dotenv.mjs";

test("parseDotenv handles keys, quotes, comments, and export", () => {
  const parsed = parseDotenv(`
# comment
DATABASE_URL=postgresql://u:p@localhost/db
export BETTER_AUTH_SECRET="abc def"
VITE_AUTH_ENABLED='true'
EMPTY=
SPACED = value # trailing comment
BAD LINE
=no-key
`);
  assert.equal(parsed.DATABASE_URL, "postgresql://u:p@localhost/db");
  assert.equal(parsed.BETTER_AUTH_SECRET, "abc def");
  assert.equal(parsed.VITE_AUTH_ENABLED, "true");
  assert.equal(parsed.EMPTY, "");
  assert.equal(parsed.SPACED, "value");
  assert.equal(parsed["BAD LINE"], undefined);
});

test("loadDotenv does not override existing process.env", () => {
  const root = mkdtempSync(join(tmpdir(), "dotenv-"));
  writeFileSync(join(root, ".env"), "DATABASE_URL=from-env\nKEEP=file\n");
  writeFileSync(join(root, ".env.local"), "KEEP=local\nNEW=yes\n");
  const env = { DATABASE_URL: "already-set" };
  const applied = loadDotenv(root, env);
  assert.equal(env.DATABASE_URL, "already-set");
  assert.equal(env.KEEP, "local");
  assert.equal(env.NEW, "yes");
  assert.equal(applied.DATABASE_URL, undefined);
  assert.equal(applied.KEEP, "local");
});

test("readDotenvFile returns {} when missing", () => {
  assert.deepEqual(readDotenvFile("/tmp/does-not-exist-dotenv-xyz.env"), {});
});
