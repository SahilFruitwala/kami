export type BookmarkletPayload = {
  url: string;
  title: string;
  html: string;
};

/**
 * Capture handoff protocol (bookmarklet + browser extension → `/capture`).
 *
 * The page HTML never travels in a URL — long articles blew past URL length
 * limits. Instead `/capture` announces `kami:ready` (to its opener and to
 * itself) until a `kami:capture` message carrying the payload arrives:
 *
 * - Bookmarklet: opens `/capture` as a popup and answers `kami:ready` from
 *   the article page via `postMessage` targeted at the KAMI origin.
 * - Extension: injects a script into the `/capture` tab that answers via
 *   same-window `postMessage`.
 */
export const CAPTURE_READY = "kami:ready";
export const CAPTURE_MESSAGE = "kami:capture";
export const CAPTURE_RECEIVED = "kami:received";

/** Keep in sync with `importInput.contentHtml` in `src/server/services/articles.ts`. */
export const MAX_CAPTURE_HTML = 1_400_000;

export function parseCapturePayload(raw: unknown): BookmarkletPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Record<keyof BookmarkletPayload, unknown>>;
  if (typeof p.html !== "string" || typeof p.title !== "string") return null;
  if (!p.html.trim()) return null;
  return {
    url: typeof p.url === "string" ? p.url.slice(0, 2000) : "",
    title: p.title.slice(0, 300),
    html: p.html.slice(0, MAX_CAPTURE_HTML),
  };
}

/** Legacy `?import=<base64 json>` payloads from older bookmarklets. */
export function decodeImportPayload(raw: string): BookmarkletPayload | null {
  try {
    const json = decodeURIComponent(escape(atob(raw)));
    return parseCapturePayload(JSON.parse(json));
  } catch {
    return null;
  }
}

/**
 * Serialize the current page without scripts/styles/embeds. Shared with the
 * browser extension (extension/background.js keeps a copy — it can't import
 * app code), so keep both in step.
 */
const SNAPSHOT_SRC = `const d=document.documentElement.cloneNode(true);d.querySelectorAll("script,style,noscript,iframe,link,template,object,embed").forEach(e=>e.remove());let h=d.outerHTML;if(h.length>${MAX_CAPTURE_HTML})h=h.slice(0,${MAX_CAPTURE_HTML});const p={title:document.title||"Untitled",url:location.href,html:h};`;

/** Bookmarklet source the user can paste as a bookmark URL. */
export function buildBookmarklet(appOrigin: string): string {
  const origin = appOrigin.replace(/\/$/, "");
  const O = JSON.stringify(origin);
  const src =
    `(()=>{try{${SNAPSHOT_SRC}` +
    `const w=open(${O}+"/capture?via=bookmarklet","_blank");` +
    `if(!w){alert("KAMI: allow pop-ups on this site to capture it.");return}` +
    `const f=e=>{if(e.source!==w||e.origin!==${O}||!e.data)return;` +
    `if(e.data.type===${JSON.stringify(CAPTURE_READY)})w.postMessage({type:${JSON.stringify(CAPTURE_MESSAGE)},payload:p},${O});` +
    `else if(e.data.type===${JSON.stringify(CAPTURE_RECEIVED)})removeEventListener("message",f)};` +
    `addEventListener("message",f);setTimeout(()=>removeEventListener("message",f),120000)` +
    `}catch(e){alert("KAMI could not capture this page.")}})()`;
  return `javascript:${src}`;
}
