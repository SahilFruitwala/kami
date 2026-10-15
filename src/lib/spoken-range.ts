function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.data.length) nodes.push(node);
  }
  return nodes;
}

export function collectSpokenText(root: HTMLElement | null): string {
  if (!root) return "";
  return textNodes(root)
    .map((node) => node.data)
    .join("");
}

function rangeFromOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const nodes = textNodes(root);
  let cursor = 0;
  let startNode: Text | null = null;
  let startOff = 0;
  let endNode: Text | null = null;
  let endOff = 0;
  for (const node of nodes) {
    const next = cursor + node.data.length;
    if (!startNode && start < next) {
      startNode = node;
      startOff = Math.max(0, start - cursor);
    }
    if (end <= next) {
      endNode = node;
      endOff = Math.max(0, end - cursor);
      break;
    }
    cursor = next;
  }
  if (!startNode) return null;
  const range = root.ownerDocument.createRange();
  try {
    range.setStart(startNode, Math.min(startOff, startNode.data.length));
    range.setEnd(
      endNode ?? startNode,
      Math.min(endOff || startOff + 1, (endNode ?? startNode).data.length),
    );
    return range;
  } catch {
    return null;
  }
}

export function paintSpokenWord(root: HTMLElement | null, start: number, end: number) {
  clearSpokenWord();
  if (!root || end <= start) return;
  const range = rangeFromOffsets(root, start, end);
  if (!range) return;
  const HighlightCtor = (window as unknown as { Highlight?: typeof Highlight }).Highlight;
  if (CSS.highlights && HighlightCtor) {
    CSS.highlights.set("spoken", new HighlightCtor(range));
  }
  const node =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const rect = range.getBoundingClientRect();
  const inView = rect.top >= 96 && rect.bottom <= window.innerHeight - 24;
  if (!inView) node?.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function clearSpokenWord() {
  CSS.highlights?.delete("spoken");
}
