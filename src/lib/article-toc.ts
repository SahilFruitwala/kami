import { decodeBasicEntities } from "./xml.ts";

export type TocEntry = {
  id: string;
  text: string;
  level: 2 | 3;
};

const MIN_HEADINGS = 2;
const MAX_ENTRIES = 40;

function headingRe() {
  return /<(h([23]))(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function headingText(inner: string): string {
  return decodeBasicEntities(stripTags(inner)).replace(/\s+/g, " ").trim();
}

function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "section";
}

function uniqueId(text: string, used: Set<string>): string {
  const base = `sec-${slugify(text)}`;
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let n = 2; n < 1000; n += 1) {
    const next = `${base}-${n}`;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
  }
  const fallback = `${base}-${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

/**
 * Pull a table of contents from article HTML when there are enough headings
 * to be useful. Short pieces and tweets stay as they are.
 */
export function withArticleToc(html: string): { html: string; entries: TocEntry[] } {
  if (!html) return { html, entries: [] };

  const preview: string[] = [];
  for (const match of html.matchAll(headingRe())) {
    const text = headingText(match[4] ?? "");
    if (!text) continue;
    preview.push(text);
    if (preview.length > MAX_ENTRIES) break;
  }
  if (preview.length < MIN_HEADINGS) return { html, entries: [] };

  const used = new Set<string>();
  const entries: TocEntry[] = [];
  const next = html.replace(
    headingRe(),
    (full, tag: string, levelStr: string, attrs = "", inner: string) => {
      if (entries.length >= MAX_ENTRIES) return full;
      const text = headingText(inner);
      if (!text) return full;
      const existing = /\sid\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
      if (existing && !used.has(existing)) {
        used.add(existing);
        entries.push({ id: existing, text, level: Number(levelStr) === 3 ? 3 : 2 });
        return full;
      }
      const id = uniqueId(text, used);
      entries.push({ id, text, level: Number(levelStr) === 3 ? 3 : 2 });
      return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
    },
  );

  if (entries.length < MIN_HEADINGS) return { html, entries: [] };
  return { html: next, entries };
}
