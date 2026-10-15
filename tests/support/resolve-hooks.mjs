import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const EMPTY = "data:text/javascript,export {};";
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts"];

function findFile(base) {
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier === "@tanstack/react-start/server-only") return { url: EMPTY, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const file = findFile(SRC + specifier.slice(2));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  const parent = context.parentURL;
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    parent?.startsWith("file:") &&
    fileURLToPath(parent).startsWith(SRC)
  ) {
    const file = findFile(fileURLToPath(new URL(specifier, parent)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return next(specifier, context);
}
