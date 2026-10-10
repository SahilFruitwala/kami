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
