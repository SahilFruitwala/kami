import type { Article } from "./article-types.ts";

const DRAFT_KEY = "quarto-draft-url";
const ARTICLE_KEY = "quarto-current-article";

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

export function readSavedArticle(): Article | null {
  try {
    const raw = sessionStorage.getItem(ARTICLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Article;
    if (!parsed || typeof parsed.contentHtml !== "string" || typeof parsed.title !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSavedArticle(article: Article | null) {
  try {
    if (!article) sessionStorage.removeItem(ARTICLE_KEY);
    else sessionStorage.setItem(ARTICLE_KEY, JSON.stringify(article));
  } catch {
    // quota — keep the draft URL so we can re-extract
  }
}
