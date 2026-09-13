import { xmlEscape } from "./xml.ts";

export type DraftStyleRange = { offset?: number; length?: number; style?: string };
export type DraftEntityRange = { offset?: number; length?: number; key?: number };
export type DraftBlock = {
  text?: string;
  type?: string;
  inlineStyleRanges?: DraftStyleRange[];
  entityRanges?: DraftEntityRange[];
};

type EntityData = {
  type?: string;
  data?: {
    url?: string;
    mediaItems?: { mediaId?: string }[];
  };
};

export type FxXArticle = {
  id?: string;
  title?: string;
  preview_text?: string;
  cover_media?: { media_info?: { original_img_url?: string } };
  content?: {
    blocks?: DraftBlock[];
    entityMap?: Record<string, unknown>;
  };
  media_entities?: { media_id?: string; media_info?: { original_img_url?: string } }[];
};

function entityOf(entry: unknown): EntityData | null {
  if (!entry || typeof entry !== "object") return null;
  const rec = entry as Record<string, unknown>;
  const inner = rec.value && typeof rec.value === "object" ? (rec.value as Record<string, unknown>) : rec;
  const type = typeof inner.type === "string" ? inner.type : undefined;
  const data = inner.data && typeof inner.data === "object" ? (inner.data as EntityData["data"]) : undefined;
  return { type, data };
}

function indexEntities(entityMap: Record<string, unknown> | undefined): Record<string, EntityData> {
  const out: Record<string, EntityData> = {};
  for (const [k, v] of Object.entries(entityMap ?? {})) {
    const parsed = entityOf(v);
    if (!parsed) continue;
    const innerKey =
      v && typeof v === "object" && "key" in v && (v as { key?: unknown }).key != null
        ? String((v as { key: unknown }).key)
        : k;
    out[innerKey] = parsed;
  }
  return out;
}

function renderInline(
  text: string,
  styles: DraftStyleRange[] | undefined,
  entityRanges: DraftEntityRange[] | undefined,
  entities: Record<string, EntityData>,
): string {
  const opens: string[][] = Array.from({ length: text.length + 1 }, () => []);
  const closes: string[][] = Array.from({ length: text.length + 1 }, () => []);

  const mark = (start: number, end: number, open: string, close: string) => {
    const from = Math.max(0, Math.min(start, text.length));
    const to = Math.max(from, Math.min(end, text.length));
    if (to <= from) return;
    opens[from].push(open);
    closes[to].unshift(close);
  };

  for (const style of styles ?? []) {
    const start = style.offset ?? 0;
    const end = start + (style.length ?? 0);
    const name = (style.style || "").toUpperCase();
    if (name === "BOLD") mark(start, end, "<strong>", "</strong>");
    else if (name === "ITALIC") mark(start, end, "<em>", "</em>");
    else if (name === "UNDERLINE") mark(start, end, "<u>", "</u>");
    else if (name === "CODE" || name === "CODESTYLE") mark(start, end, "<code>", "</code>");
  }

  for (const range of entityRanges ?? []) {
    const ent = entities[String(range.key ?? "")];
    if (ent?.type === "LINK" && ent.data?.url) {
      const start = range.offset ?? 0;
      mark(start, start + (range.length ?? 0), `<a href="${xmlEscape(ent.data.url)}">`, "</a>");
    }
  }

  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    out += closes[i].join("");
    out += opens[i].join("");
    out += xmlEscape(text[i] ?? "");
  }
  out += closes[text.length].join("");
  out += opens[text.length].join("");
  return out;
}

function mediaUrlFor(
  range: DraftEntityRange | undefined,
  entities: Record<string, EntityData>,
  mediaById: Map<string, string>,
): string | null {
  const ent = entities[String(range?.key ?? "")];
  if (!ent) return null;
  if (ent.type === "DIVIDER") return "divider";
  const mediaId = ent.data?.mediaItems?.[0]?.mediaId;
  if (mediaId && mediaById.has(mediaId)) return mediaById.get(mediaId) ?? null;
  return null;
}

export function xArticleBlocksToHtml(article: FxXArticle): string {
  const blocks = article.content?.blocks ?? [];
  const entities = indexEntities(article.content?.entityMap);
  const mediaById = new Map<string, string>();
  for (const media of article.media_entities ?? []) {
    const id = media.media_id;
    const url = media.media_info?.original_img_url;
    if (id && url) mediaById.set(id, url);
  }

  const parts: string[] = [];
  const cover = article.cover_media?.media_info?.original_img_url;
  if (cover) {
    parts.push(`<figure><img src="${xmlEscape(cover)}" alt="${xmlEscape(article.title || "Cover")}"/></figure>`);
  }

  let listTag: "ol" | "ul" | null = null;
  const listItems: string[] = [];
  const flushList = () => {
    if (!listTag || !listItems.length) {
      listTag = null;
      listItems.length = 0;
      return;
    }
    parts.push(`<${listTag}>${listItems.join("")}</${listTag}>`);
    listTag = null;
    listItems.length = 0;
  };

  for (const block of blocks) {
    const type = block.type || "unstyled";
    const text = block.text ?? "";
    const inline = renderInline(text, block.inlineStyleRanges, block.entityRanges, entities);

    if (type === "ordered-list-item" || type === "unordered-list-item") {
      const tag = type === "ordered-list-item" ? "ol" : "ul";
      if (listTag && listTag !== tag) flushList();
      listTag = tag;
      listItems.push(`<li>${inline}</li>`);
      continue;
    }
    flushList();

    if (type === "atomic") {
      const media = mediaUrlFor(block.entityRanges?.[0], entities, mediaById);
      if (media === "divider") parts.push("<hr/>");
      else if (media) parts.push(`<figure><img src="${xmlEscape(media)}" alt=""/></figure>`);
      continue;
    }

    if (!text.trim()) continue;

    if (type === "header-one") parts.push(`<h2>${inline}</h2>`);
    else if (type === "header-two") parts.push(`<h3>${inline}</h3>`);
    else if (type === "header-three" || type === "header-four") parts.push(`<h4>${inline}</h4>`);
    else if (type === "blockquote") parts.push(`<blockquote><p>${inline}</p></blockquote>`);
    else if (type === "code-block") parts.push(`<pre><code>${inline}</code></pre>`);
    else parts.push(`<p>${inline}</p>`);
  }
  flushList();

  return parts.join("");
}

export function isBareXArticleLink(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return /^(https?:\/\/)?((www\.)?(x|twitter)\.com\/(?:i\/|[^/\s]+\/)article\/\d+|t\.co\/\w+)\/?$/i.test(
    trimmed,
  );
}
