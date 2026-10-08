import { parseHTML } from "linkedom";
import { pickImageSrc } from "./image-url.ts";
import { absoluteUrl } from "./safe-url.ts";

const ALLOWED_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "UL",
  "OL",
  "LI",
  "STRONG",
  "EM",
  "B",
  "I",
  "A",
  "IMG",
  "FIGURE",
  "FIGCAPTION",
  "PRE",
  "CODE",
  "BR",
  "HR",
  "DIV",
  "SPAN",
  "TABLE",
  "THEAD",
  "TBODY",
  "TR",
  "TH",
  "TD",
  "SUP",
  "SUB",
]);

/** Drop entirely (do not unwrap children — nested payloads can stay dangerous). */
const FORBIDDEN_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "APPLET",
  "NOSCRIPT",
  "SVG",
  "MATH",
  "LINK",
  "META",
  "BASE",
  "FORM",
  "INPUT",
  "BUTTON",
  "TEXTAREA",
  "SELECT",
  "OPTION",
  "TEMPLATE",
  "FOREIGNOBJECT",
]);

export function sanitizeHtml(html: string, baseUrl: string): string {
  const { document } = parseHTML(`<div id="root">${html}</div>`);
  const root = document.getElementById("root");
  if (!root) return "";

  const walk = (node: Element) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 8) {
        child.remove();
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (FORBIDDEN_TAGS.has(tag)) {
        el.remove();
        continue;
      }
      walk(el);
      if (tag === "A" && (el.textContent || "").trim().toLowerCase() === "edit") {
        el.remove();
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        const parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          el.remove();
        }
        continue;
      }
      const keep = new Map<string, string>();
      if (tag === "A") {
        const href = el.getAttribute("href");
        if (href) {
          const abs = absoluteUrl(href, baseUrl);
          if (abs) keep.set("href", abs);
        }
      }
      if (tag === "IMG") {
        // Already mirrored into our storage: keep the same-origin path as-is
        // (resolving it against the article URL would break it on re-save).
        const rawSrc = el.getAttribute("src") ?? "";
        const abs = /^\/api\/media\/[a-f0-9]{64}\.[a-z0-9]+$/.test(rawSrc)
          ? rawSrc
          : pickImageSrc(el, baseUrl);
        if (!abs) {
          el.remove();
          continue;
        }
        keep.set("src", abs);
        const alt = el.getAttribute("alt");
        if (alt) keep.set("alt", alt);
      }
      for (const attr of Array.from(el.attributes)) {
        el.removeAttribute(attr.name);
      }
      for (const [k, v] of keep) el.setAttribute(k, v);
    }
  };

  walk(root);
  return root.innerHTML.trim();
}
