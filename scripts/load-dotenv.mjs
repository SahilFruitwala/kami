#!/usr/bin/env node
/**
 * Minimal `.env` / `.env.local` loader (no dependency).
 *
 * Existing `process.env` keys always win. `.env.local` overrides `.env`.
 * Used by `with-app-env.mjs` and `migrate.mjs` so local Docker Postgres
 * (`DATABASE_URL`) and auth secrets reach Node for local development.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Parse a dotenv document into a flat string map.
 * Supports `KEY=value`, optional `export `, `#` comments, and single/double quotes.
 */
export function parseDotenv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  if (typeof text !== "string" || !text) return out;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const cleaned = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = cleaned.indexOf("=");
    if (eq <= 0) continue;

    const key = cleaned.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = cleaned.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      // Unquoted: strip inline comment
      const hash = value.indexOf(" #");
      if (hash >= 0) value = value.slice(0, hash).trimEnd();
    }
    out[key] = value;
  }
  return out;
}

/** Read one env file; missing/unreadable → `{}`. */
export function readDotenvFile(path) {
  try {
    return parseDotenv(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Load `.env` then `.env.local` from `root`. Does not override keys already
 * present in `processEnv` (defaults to `process.env`).
 * @returns {Record<string, string>} keys that were applied
 */
export function loadDotenv(root, processEnv = process.env) {
  const fromFiles = {
    ...readDotenvFile(join(root, ".env")),
    ...readDotenvFile(join(root, ".env.local")),
  };
  /** @type {Record<string, string>} */
  const applied = {};
  for (const [key, value] of Object.entries(fromFiles)) {
    if (processEnv[key] !== undefined) continue;
    processEnv[key] = value;
    applied[key] = value;
  }
  return applied;
}
