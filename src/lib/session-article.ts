import { parseCapturePayload, type BookmarkletPayload } from "./bookmarklet.ts";

const DRAFT_KEY = "quarto-draft-url";
const IMPORT_KEY = "quarto-capture-payload";

/**
 * Stash a captured page so it survives the auth/loading gate on `/app`.
 * Returns false if storage refused it (quota / private mode).
 */
export function stashCapturePayload(payload: BookmarkletPayload): boolean {
  try {
    sessionStorage.setItem(IMPORT_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/** Take (and clear) a stashed capture. */
export function takeStashedCapturePayload(): BookmarkletPayload | null {
  try {
    const raw = sessionStorage.getItem(IMPORT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(IMPORT_KEY);
    return parseCapturePayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function normalizeSourceUrl(raw: string): string {
  let value = raw.trim().replace(/[<>"]/g, "");
  if (!value) return "";
  const first = value.split(/\s+/)[0] ?? "";
  value = first;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (
    /^(www\.|x\.com\/|twitter\.com\/|en\.wikipedia\.org\/)/i.test(value) ||
    /^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(value)
  ) {
    return `https://${value}`;
  }
  return value;
}

/**
 * Split pasted text into distinct URLs for bulk save. Accepts newlines,
 * commas, semicolons, or whitespace separation; strips bullets/numbering and
 * wrapping quotes/brackets; normalizes bare domains; dedupes preserving order.
 */
export function parseBulkUrls(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const tokens = raw
    .replace(/[<>"]/g, " ")
    .split(/[\s,;]+/)
    .map((t) =>
      t
        .trim()
        .replace(/^[\s]*[-*•\d.)\]]+\s*/, "")
        .replace(/^[([{'"“‘]+|[)\]}'"”‘.,!?]+$/g, "")
        .trim(),
    )
    .filter(Boolean);
  for (const token of tokens) {
    // Skip bare words / fragments that can't be URLs.
    if (!/^(https?:\/\/|\/\/|www\.|[\w-]+(\.[\w-]+)+([/:?#]|$))/i.test(token)) continue;
    const normalized = normalizeSourceUrl(token);
    if (!normalized) continue;
    if (!/^https?:\/\/[\w.-]+\.[a-z]{2,}/i.test(normalized)) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function readDraftUrl(): string {
  try {
    return sessionStorage.getItem(DRAFT_KEY) || "";
  } catch {
    return "";
  }
}

export function writeDraftUrl(url: string) {
  try {
    if (url) sessionStorage.setItem(DRAFT_KEY, url);
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // quota / private mode
  }
}
