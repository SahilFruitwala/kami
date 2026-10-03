import type { Folder, Highlight, LibraryItem } from "./store.ts";
import { articleIdFromUrl } from "./store.ts";

/** Shared import/export helpers: library JSON, OPML, vault CSV, duplicates. */

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toLibraryJson(library: LibraryItem[], folders: Folder[]): string {
  return JSON.stringify(
    { app: "kami", version: 1, exportedAt: new Date().toISOString(), library, folders },
    null,
    2,
  );
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function toOPML(library: LibraryItem[]): string {
  const outlines = library
    .map(
      (row) =>
        `    <outline type="rss" text="${escapeXml(row.title)}" title="${escapeXml(row.title)}" xmlUrl="${escapeXml(row.url)}" htmlUrl="${escapeXml(row.canonicalUrl || row.url)}"/>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Kami Library Export</title>\n    <dateCreated>${new Date().toUTCString()}</dateCreated>\n  </head>\n  <body>\n${outlines}\n  </body>\n</opml>\n`;
}

export type ImportedLink = { title: string; url: string };

export function parseOPML(text: string): ImportedLink[] {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("Could not parse that OPML file.");
  const out: ImportedLink[] = [];
  doc.querySelectorAll("outline").forEach((el) => {
    // Only leaf outlines carry feeds; parents are categories.
    if (el.querySelector("outline")) return;
    const url =
      el.getAttribute("xmlUrl") || el.getAttribute("url") || el.getAttribute("htmlUrl") || "";
    if (!/^https?:\/\//i.test(url)) return;
    out.push({
      title: el.getAttribute("title") || el.getAttribute("text") || url,
      url,
    });
  });
  return out;
}

export type ImportedLibrary = { library: LibraryItem[]; folders: Folder[] };

export function parseLibraryJson(text: string): ImportedLibrary {
  const parsed = JSON.parse(text) as {
    library?: unknown;
    folders?: unknown;
  };
  if (!parsed || !Array.isArray(parsed.library)) {
    throw new Error("That JSON is not a Kami library export.");
  }
  const library = (parsed.library as Array<Partial<LibraryItem>>).filter(
    (row): row is LibraryItem =>
      Boolean(row) && typeof (row.url || row.id) === "string" && typeof row.title === "string",
  );
  const folders = Array.isArray(parsed.folders)
    ? (parsed.folders as Folder[]).filter((f) => f && typeof f.id === "string")
    : [];
  return { library, folders };
}

/** Minimal link-only row for imported URLs — the reader fetches a clean copy on open. */
export function linkOnlyItem(url: string, title: string): LibraryItem {
  const clean = url.trim();
  return {
    id: articleIdFromUrl(clean),
    url: clean,
    canonicalUrl: clean,
    title: title.trim().slice(0, 200) || "Untitled",
    author: "",
    siteName: "",
    source: "blog",
    wordCount: 0,
    readingMinutes: 1,
    excerpt: "",
    contentHtml: "",
    heroImage: null,
    published: null,
    savedAt: Date.now(),
    archived: false,
    tags: [],
    folderId: null,
    highlights: [],
    favorited: false,
    note: "",
  };
}

const CSV_CELL = (v: string | number) => `"${String(v ?? "").replaceAll('"', '""')}"`;

export function toVaultCsv(library: LibraryItem[]): string {
  const rows = library.flatMap((item) =>
    (item.highlights ?? []).map((h: Highlight) =>
      [
        new Date(h.createdAt).toISOString(),
        item.title,
        item.author || item.siteName || "",
        item.url,
        (item.tags ?? []).join("; "),
        h.text,
        h.note,
      ]
        .map(CSV_CELL)
        .join(","),
    ),
  );
  return `created_at,title,author,url,tags,passage,note\n${rows.join("\n")}\n`;
}

/** Canonical URL key for duplicate detection: lowercase host, no www,
 *  no trailing slash, no query/hash. */
export function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path === "/" ? "" : path}`;
  } catch {
    return url.trim().toLowerCase().replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

export function findDuplicateGroups(library: LibraryItem[]): LibraryItem[][] {
  const byKey = new Map<string, LibraryItem[]>();
  for (const row of library) {
    const urlKey = row.url ? `u:${normalizeUrlKey(row.url)}` : "";
    const titleKey = row.title.trim().toLowerCase().slice(0, 120);
    // Prefer URL grouping; fall back to exact-title grouping for imports without URLs.
    const key = urlKey || (titleKey ? `t:${titleKey}` : "");
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  return [...byKey.values()].filter((g) => g.length > 1);
}
