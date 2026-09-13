import type { Article, ExtractResult } from "./article-types.ts";

function apiBase(): string {
  const fromEnv = (import.meta.env.VITE_QUARTO_API_BASE as string | undefined)?.replace(/\/$/, "");
  return fromEnv || "";
}

async function postJson(path: string, body: unknown): Promise<ExtractResult> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: ExtractResult | null = null;
  try {
    data = (await res.json()) as ExtractResult;
  } catch {
    return { ok: false, error: `API returned ${res.status}.` };
  }
  if (!data || typeof data !== "object" || !("ok" in data)) {
    return { ok: false, error: `Unexpected API response (${res.status}).` };
  }
  return data;
}

export async function apiExtract(url: string): Promise<ExtractResult> {
  return postJson("/api/v1/extract", { url });
}

export async function apiImport(input: {
  url?: string;
  title: string;
  contentHtml?: string;
  contentText?: string;
}): Promise<ExtractResult> {
  return postJson("/api/v1/import", input);
}

export async function apiSaveLink(url: string, title?: string): Promise<ExtractResult> {
  return postJson("/api/v1/link", { url, title });
}

export type BookmarkletPayload = {
  url: string;
  title: string;
  html: string;
};

export function encodeImportPayload(payload: BookmarkletPayload): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
}

export function decodeImportPayload(raw: string): BookmarkletPayload | null {
  try {
    const json = decodeURIComponent(escape(atob(raw)));
    const parsed = JSON.parse(json) as Partial<BookmarkletPayload>;
    if (!parsed || typeof parsed.html !== "string" || typeof parsed.title !== "string") return null;
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      title: parsed.title,
      html: parsed.html,
    };
  } catch {
    return null;
  }
}

/** Bookmarklet source the user can drag to the bookmarks bar. */
export function buildBookmarklet(appOrigin: string): string {
  const origin = appOrigin.replace(/\/$/, "");
  const src = `(()=>{try{const t=document.title||"Untitled";const n=document.querySelector("article,.post-content,.entry-content,main")||document.body;const h=(n&&n.innerHTML||"").slice(0,450000);const u=location.href;const p=btoa(unescape(encodeURIComponent(JSON.stringify({title:t,url:u,html:h}))));open(${JSON.stringify(`${origin}/?import=`)}+encodeURIComponent(p),"_blank","noopener")}catch(e){alert("Quarto could not capture this page.")}})()`;
  return `javascript:${src}`;
}

export type { Article };
