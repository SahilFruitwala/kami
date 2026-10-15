import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = new URL("..", import.meta.url).pathname;
const API_DIR = join(ROOT, "src/routes/api");

function routeFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? routeFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

/** Every `METHOD /api/path` the route files serve. */
function endpoints() {
  const out = [];
  for (const file of routeFiles(API_DIR)) {
    const src = readFileSync(file, "utf8");
    const route = src.match(/createFileRoute\("([^"]+)"\)/)?.[1];
    if (!route) continue;
    const path = route.replace(/\$(\w+)/g, ":$1").replace(/\/$/, "");
    const handlers = src.slice(src.indexOf("handlers"));
    for (const [, method] of handlers.matchAll(/\b(GET|POST|PUT|PATCH|DELETE):/g)) {
      out.push({ method, path });
    }
  }
  return out;
}

describe("docs/API.md", () => {
  const doc = readFileSync(join(ROOT, "docs/API.md"), "utf8").split("\n");
  it("documents every /api route and method", () => {
    const missing = endpoints().filter(
      ({ method, path }) =>
        !doc.some((line) => line.includes("`" + path + "`") && line.includes("`" + method + "`")),
    );
    assert.deepEqual(missing, [], "add these to docs/API.md");
  });
});
