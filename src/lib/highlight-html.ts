import type { Highlight } from "./store.ts";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textNodes(root: Element): Text[] {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data.length) continue;
    if (node.parentElement?.closest("mark")) continue;
    nodes.push(node);
  }
  return nodes;
}

function wrapQuote(root: Element, quote: string, id: string, color: string): boolean {
  const nodes = textNodes(root);
  if (!nodes.length) return false;

  let concat = "";
  const index: { node: Text; offset: number }[] = [];
  for (const node of nodes) {
    for (let i = 0; i < node.data.length; i += 1) {
      concat += node.data[i];
      index.push({ node, offset: i });
    }
  }

  const words = quote.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!words.length) return false;
  const match = concat.match(new RegExp(words.join("\\s+")));
  if (!match || match.index == null) return false;

  const from = match.index;
  const to = from + match[0].length;
  if (to <= from) return false;

  const slices: { node: Text; from: number; to: number }[] = [];
  let current: { node: Text; from: number; to: number } | null = null;
  for (let i = from; i < to; i += 1) {
    const point = index[i];
    if (!point) continue;
    if (!current || current.node !== point.node) {
      current = { node: point.node, from: point.offset, to: point.offset + 1 };
      slices.push(current);
    } else {
      current.to = point.offset + 1;
    }
  }

  for (let i = slices.length - 1; i >= 0; i -= 1) {
    const slice = slices[i];
    if (!slice || slice.to <= slice.from) continue;
    const parent = slice.node.parentNode;
    if (!parent || (parent as Element).nodeName === "MARK") continue;
    const text = slice.node.data;
    const before = text.slice(0, slice.from);
    const mid = text.slice(slice.from, slice.to);
    const after = text.slice(slice.to);
    if (!mid) continue;
    const doc = slice.node.ownerDocument;
    const mark = doc.createElement("mark");
    mark.setAttribute("data-hid", id);
    mark.setAttribute("data-color", color);
    mark.appendChild(doc.createTextNode(mid));
    const frag = doc.createDocumentFragment();
    if (before) frag.appendChild(doc.createTextNode(before));
    frag.appendChild(mark);
    if (after) frag.appendChild(doc.createTextNode(after));
    parent.replaceChild(frag, slice.node);
  }
  return slices.length > 0;
}

export function applyHighlights(html: string, highlights: Highlight[]): string {
  if (!highlights.length || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root");
  if (!root) return html;
  const sorted = [...highlights].sort((a, b) => b.text.length - a.text.length);
  for (const highlight of sorted) {
    const quote = highlight.text.trim();
    if (quote.length < 8) continue;
    wrapQuote(root, quote, highlight.id, highlight.color || "amber");
  }
  return root.innerHTML;
}

export function htmlToPlainText(html: string): string {
  if (typeof DOMParser === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}
