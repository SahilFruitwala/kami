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

/** Bookmarklet source the user can paste as a bookmark URL. */
export function buildBookmarklet(appOrigin: string): string {
  const origin = appOrigin.replace(/\/$/, "");
  const src = `(()=>{try{const t=document.title||"Untitled";const n=document.querySelector("article,.post-content,.entry-content,main")||document.body;const h=(n&&n.innerHTML||"").slice(0,450000);const u=location.href;const p=btoa(unescape(encodeURIComponent(JSON.stringify({title:t,url:u,html:h}))));open(${JSON.stringify(`${origin}/?import=`)}+encodeURIComponent(p),"_blank","noopener")}catch(e){alert("Quarto could not capture this page.")}})()`;
  return `javascript:${src}`;
}
