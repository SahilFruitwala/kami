/**
 * Substack-specific extraction. Readability does a passable job on Substack,
 * but it lets subscribe widgets, share/"Set Up Podcast" buttons and image
 * toolbars through, mangles footnotes, and drops embeds silently. Substack's
 * post markup is stable (`.available-content > .body.markup`), so we take the
 * body directly and clean it with known component classes.
 *
 * Works on custom domains too (e.g. writing.example.com): detection keys off
 * the markup and Substack's CDN, not the hostname.
 */

type Doc = Document;

const BODY_SELECTORS = [".available-content .body.markup", "article .body.markup", ".body.markup"];

/** Chrome inside the post body that has no place in a clean reading copy. */
const JUNK_SELECTORS = [
  ".subscription-widget-wrap",
  ".subscription-widget-wrap-editor",
  ".subscription-widget",
  ".subscribe-widget",
  ".button-wrapper",
  ".captioned-button-wrap",
  ".image-link-expand",
  ".share-dialog",
  ".post-ufi",
  ".paywall",
  ".paywall-jump",
  ".install-substack-app-embed",
  ".community-chat",
  ".poll-embed",
  ".native-audio-embed",
  ".native-video-embed",
  ".visibility-check",
  '[data-component-name="SubscribeWidgetToDOM"]',
  '[data-component-name="SubscribeWidget"]',
  '[data-component-name="ButtonCreateButton"]',
  '[data-component-name="CaptionedButtonToDOM"]',
  '[data-component-name="InstallSubstackAppToDOM"]',
  '[data-component-name="PollToDOM"]',
];

export function isSubstackDocument(document: Doc, pageUrl: string): boolean {
  let host = "";
  try {
    host = new URL(pageUrl).hostname.toLowerCase();
  } catch {
    // fall through to markup detection
  }
  const hasBody = Boolean(document.querySelector(".body.markup"));
  if (host === "substack.com" || host.endsWith(".substack.com")) return hasBody;
  if (!hasBody) return false;
  // Custom domain: look for Substack's CDN in meta / link / script / img.
  return Boolean(
    document.querySelector(
      [
        'meta[content*="substackcdn.com"]',
        'link[href*="substackcdn.com"]',
        'script[src*="substackcdn.com"]',
        'img[src*="substackcdn.com"]',
        '[data-component-name="FootnoteAnchorToDOM"]',
        '[data-component-name="Image2ToDOM"]',
      ].join(","),
    ),
  );
}

function dataAttrs(el: Element): Record<string, unknown> {
  const raw = el.getAttribute("data-attrs");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function replaceWithLink(document: Doc, el: Element, href: string, label: string) {
  if (!href) {
    el.remove();
    return;
  }
  const p = document.createElement("p");
  const a = document.createElement("a");
  a.setAttribute("href", href);
  a.textContent = label;
  p.appendChild(a);
  el.replaceWith(p);
}

function unwrap(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  el.remove();
}

function cleanImages(body: Element) {
  // Substack wraps every image in a link to the full-size file plus a
  // <picture> whose srcset URLs contain commas — use the plain <img src>.
  for (const a of Array.from(body.querySelectorAll("a.image-link, a.image2"))) unwrap(a);
  for (const source of Array.from(body.querySelectorAll("picture source"))) source.remove();
  for (const img of Array.from(body.querySelectorAll("img"))) {
    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    if (!img.getAttribute("src")) {
      const original = str(dataAttrs(img).src);
      if (original) img.setAttribute("src", original);
    }
    if (!img.getAttribute("alt")) {
      const alt = str(dataAttrs(img).alt);
      if (alt) img.setAttribute("alt", alt);
    }
  }
}

function cleanFootnotes(document: Doc, body: Element) {
  // In-page anchors can't survive sanitizing (ids are stripped), so render
  // footnote markers as plain superscripts and the notes as numbered blocks.
  for (const anchor of Array.from(body.querySelectorAll("a.footnote-anchor"))) {
    const sup = document.createElement("sup");
    sup.textContent = (anchor.textContent || "").trim();
    anchor.replaceWith(sup);
  }
  const notes = Array.from(body.querySelectorAll("div.footnote"));
  if (!notes.length) return;
  const hr = document.createElement("hr");
  notes[0].parentNode?.insertBefore(hr, notes[0]);
  for (const note of notes) {
    const number = (note.querySelector(".footnote-number")?.textContent || "").trim();
    const content = note.querySelector(".footnote-content");
    const wrap = document.createElement("div");
    const paragraphs = content ? Array.from(content.children) : [];
    if (number) {
      const sup = document.createElement("sup");
      sup.textContent = number;
      const first = paragraphs[0];
      if (first && first.tagName.toUpperCase() === "P") {
        first.insertBefore(document.createTextNode(" "), first.firstChild);
        first.insertBefore(sup, first.firstChild);
      } else {
        wrap.appendChild(sup);
        wrap.appendChild(document.createTextNode(" "));
      }
    }
    if (content) while (content.firstChild) wrap.appendChild(content.firstChild);
    note.replaceWith(wrap);
  }
}

function cleanEmbeds(document: Doc, body: Element) {
  for (const el of Array.from(
    body.querySelectorAll(".youtube-wrap, [data-component-name='Youtube2ToDOM']"),
  )) {
    const id = str(dataAttrs(el).videoId);
    replaceWithLink(
      document,
      el,
      id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : "",
      "Watch on YouTube",
    );
  }
  for (const el of Array.from(
    body.querySelectorAll(".tweet, [data-component-name='Twitter2ToDOM']"),
  )) {
    const attrs = dataAttrs(el);
    const author = str(attrs.username) || str(attrs.name);
    replaceWithLink(
      document,
      el,
      str(attrs.url),
      author ? `View post by @${author} on X` : "View post on X",
    );
  }
  for (const el of Array.from(
    body.querySelectorAll(
      ".embedded-post-wrap, .digest-post-embed, [data-component-name='EmbeddedPostToDOM']",
    ),
  )) {
    const attrs = dataAttrs(el);
    const href = str(attrs.url) || el.querySelector("a[href]")?.getAttribute("href")?.trim() || "";
    const title =
      str(attrs.title) || (el.querySelector(".embedded-post-title")?.textContent || "").trim();
    const pub = str(attrs.publication_name);
    replaceWithLink(document, el, href, [title || "Linked post", pub].filter(Boolean).join(" — "));
  }
  for (const el of Array.from(body.querySelectorAll(".pullquote"))) {
    const quote = document.createElement("blockquote");
    while (el.firstChild) quote.appendChild(el.firstChild);
    el.replaceWith(quote);
  }
  for (const el of Array.from(body.querySelectorAll(".latex-rendered"))) {
    const expr = str(dataAttrs(el).persistentExpression);
    if (!expr) continue;
    const code = document.createElement("code");
    code.textContent = expr;
    el.replaceWith(code);
  }
}

export type SubstackExtract = {
  contentHtml: string;
  title: string;
  subtitle: string;
  author: string;
  paywalled: boolean;
};

export function extractSubstack(document: Doc, pageUrl: string): SubstackExtract | null {
  let body: Element | null = null;
  for (const selector of BODY_SELECTORS) {
    body = document.querySelector(selector);
    if (body) break;
  }
  if (!body) return null;

  const paywalled = Boolean(document.querySelector(".paywall, [data-testid='paywall']"));

  for (const el of Array.from(body.querySelectorAll(JUNK_SELECTORS.join(",")))) el.remove();
  cleanImages(body);
  cleanFootnotes(document, body);
  cleanEmbeds(document, body);

  let contentHtml = body.innerHTML.trim();
  if (paywalled) {
    const href = pageUrl.replace(/"/g, "&quot;");
    contentHtml += `<hr><p><em>This post continues for paid subscribers. <a href="${href}">Read the rest on Substack</a>.</em></p>`;
  }

  const title = (
    document.querySelector("h1.post-title")?.textContent ||
    document.querySelector(".post-header h1")?.textContent ||
    ""
  ).trim();
  const subtitle = (
    document.querySelector("h3.subtitle")?.textContent ||
    document.querySelector(".post-header .subtitle")?.textContent ||
    ""
  ).trim();
  const author = Array.from(
    document.querySelectorAll(
      ".post-header .byline-wrapper a[href*='/@'], .post-header [data-testid='author-name']",
    ),
  )
    .map((a) => (a.textContent || "").trim())
    .filter(Boolean)
    .filter((name, i, all) => all.indexOf(name) === i)
    .join(", ");

  return { contentHtml, title, subtitle, author, paywalled };
}
