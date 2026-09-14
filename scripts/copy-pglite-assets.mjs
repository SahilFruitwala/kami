#!/usr/bin/env node
/**
 * Copy PGLite WASM/data assets next to the Nitro-bundled `electric-sql__pglite`
 * chunk. Auth-on builds import Better Auth's PGLite dialect when DATABASE_URL is
 * unset (local `npm run preview`); without these files the preview process
 * crashes on boot. Deployed apps set DATABASE_URL and use Neon instead.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, "node_modules", "@electric-sql", "pglite", "dist");
const destDir = join(
  root,
  ".vercel",
  "output",
  "functions",
  "__server.func",
  "_libs",
);

const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];

if (!existsSync(destDir)) {
  console.log("[pglite-assets] no Vercel server output yet — skipping.");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
let copied = 0;
for (const name of files) {
  const from = join(srcDir, name);
  if (!existsSync(from)) {
    console.warn(`[pglite-assets] missing source ${name}`);
    continue;
  }
  copyFileSync(from, join(destDir, name));
  copied += 1;
}
console.log(`[pglite-assets] copied ${copied} file(s) into server _libs.`);
