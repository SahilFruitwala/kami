import { parseHTML } from "linkedom";

/**
 * Split a saved article's HTML into top-level blocks so a model can point at
 * the ones to drop (sponsor slots, subscribe prompts, footers) by number,
 * without rewriting the text. Single-child wrappers (newsletter layout
 * divs/tables) are descended into first. Tested in scripts/ai.test.mjs.
 */

export type HtmlBlocks = { blocks: string[]; previews: string[] };

const MAX_BLOCKS = 250;

function previewOf(el: Element): string {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const links = el.querySelectorAll?.("a").length ?? 0;
  const images = el.tagName === "IMG" ? 1 : (el.querySelectorAll?.("img").length ?? 0);
  const body = text.length > 220 ? `${text.slice(0, 160)} … ${text.slice(-50)}` : text;
  const extras = [
    images ? `${images} image${images > 1 ? "s" : ""}` : "",
    links ? `${links} link${links > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  return `<${el.tagName.toLowerCase()}> ${body || "(no text)"}${extras ? ` [${extras}]` : ""}`;
}

export function splitBlocks(html: string): HtmlBlocks {
  const { document } = parseHTML(`<div id="root">${html}</div>`);
  const container = document.getElementById("root") as Element | null;
  if (!container) return { blocks: [], previews: [] };
  let root: Element = container;

  // Descend through lone wrappers (a single element child and no text of its own).
  for (let depth = 0; depth < 12; depth++) {
    const elements: Element[] = [...root.children];
    const ownText = [...root.childNodes].some(
      (n) => n.nodeType === 3 && (n.textContent ?? "").trim(),
    );
    if (elements.length !== 1 || ownText) break;
    const only: Element = elements[0];
    if (/^(P|H[1-6]|BLOCKQUOTE|PRE|UL|OL|FIGURE|IMG)$/.test(only.tagName)) break;
    root = only;
  }

  const blocks: string[] = [];
  const previews: string[] = [];
  for (const node of [...root.childNodes]) {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? "").trim();
      if (!text) continue;
      const p = document.createElement("p");
      p.textContent = text;
      blocks.push(p.outerHTML);
      previews.push(`<p> ${text.slice(0, 200)}`);
    } else if (node.nodeType === 1) {
      const el = node as Element;
      blocks.push(el.outerHTML);
      previews.push(previewOf(el));
    }
  }
  return { blocks, previews: previews.slice(0, MAX_BLOCKS) };
}

/** Rejoin blocks without the dropped indexes. */
export function joinBlocks(blocks: string[], drop: Set<number>): string {
  return blocks.filter((_, i) => !drop.has(i)).join("\n");
}

const CONTENT_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figure,table";
const NOISE_SELECTOR =
  "script,style,noscript,template,svg,nav,header,footer,aside,form,iframe,button";
const MAX_CONTENT_BLOCKS = 400;

export type ContentBlock = { tag: string; html: string };

/**
 * Collect a whole page's readable blocks (headings, paragraphs, list items,
 * quotes, code, figures, tables) in document order, skipping page chrome and
 * blocks nested inside another collected block. Used when Readability can't
 * find the article: a model then picks which numbered blocks are the piece.
 */
export function collectContentBlocks(html: string): {
  title: string;
  blocks: ContentBlock[];
  previews: string[];
} {
  const { document } = parseHTML(html);
  const title = (document.querySelector("title")?.textContent ?? "").replace(/\s+/g, " ").trim();
  for (const el of [...document.querySelectorAll(NOISE_SELECTOR)]) el.remove();
  const body = document.body ?? document.documentElement;
  const blocks: ContentBlock[] = [];
  const previews: string[] = [];
  for (const el of [...body.querySelectorAll(CONTENT_SELECTOR)] as Element[]) {
    if (el.parentElement?.closest(CONTENT_SELECTOR)) continue;
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text && el.tagName !== "FIGURE") continue;
    blocks.push({ tag: el.tagName.toLowerCase(), html: el.outerHTML });
    previews.push(previewOf(el));
    if (blocks.length >= MAX_CONTENT_BLOCKS) break;
  }
  return { title, blocks, previews };
}

/** Rebuild HTML from chosen blocks, wrapping runs of list items back into a list. */
export function joinContentBlocks(blocks: ContentBlock[]): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.join("")}</ul>`);
    list = [];
  };
  for (const block of blocks) {
    if (block.tag === "li") {
      list.push(block.html);
      continue;
    }
    flush();
    out.push(block.html);
  }
  flush();
  return out.join("\n");
}
