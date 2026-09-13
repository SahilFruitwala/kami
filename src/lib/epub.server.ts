import JSZip from "jszip";
import { parseHTML } from "linkedom";
import type { Article, EpubResult } from "./article-types.ts";
import { sanitizeHtml } from "./extract.server.ts";
import { fetchImageBytes } from "./fetch-image.server.ts";
import { xmlEscape } from "./xml.ts";

const MAX_IMAGES = 16;
const MAX_EPUB_IMAGE_BYTES = 700_000;

function slugFilename(title: string): string {
  const base = title
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "quarto-article"}.epub`;
}

function toXhtmlFragment(html: string, baseUrl: string): string {
  const clean = sanitizeHtml(html, baseUrl);
  const { document } = parseHTML(`<div id="root">${clean}</div>`);
  const root = document.getElementById("root");
  if (!root) return "<p></p>";

  const serialize = (node: { nodeType: number; textContent: string | null; tagName?: string; getAttribute?: (name: string) => string | null; childNodes: ArrayLike<{ nodeType: number }> }): string => {
    if (node.nodeType === 3) return xmlEscape(node.textContent ?? "");
    if (node.nodeType !== 1) return "";
    const el = node as typeof node & {
      tagName: string;
      getAttribute: (name: string) => string | null;
      childNodes: ArrayLike<typeof node>;
    };
    const tag = el.tagName.toLowerCase();
    const VOID = new Set(["br", "hr", "img"]);
    const attrs: string[] = [];
    if (tag === "a" && el.getAttribute("href")) {
      attrs.push(`href="${xmlEscape(el.getAttribute("href") || "")}"`);
    }
    if (tag === "img") {
      const src = el.getAttribute("src") || "";
      const alt = el.getAttribute("alt") || "";
      attrs.push(`src="${xmlEscape(src)}"`, `alt="${xmlEscape(alt)}"`);
    }
    const attrStr = attrs.length ? ` ${attrs.join(" ")}` : "";
    if (VOID.has(tag)) return `<${tag}${attrStr}/>`;
    const inner = Array.from(el.childNodes).map((child) => serialize(child as typeof node)).join("");
    return `<${tag}${attrStr}>${inner}</${tag}>`;
  };

  const body = Array.from(root.childNodes).map((node) =>
    serialize(node as Parameters<typeof serialize>[0]),
  ).join("");
  return body.trim() || "<p></p>";
}

function formatPublished(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type ImageManifest = { id: string; href: string; type: string };

async function embedImages(html: string, zip: JSZip): Promise<{ html: string; manifest: ImageManifest[] }> {
  const { document } = parseHTML(`<div id="root">${html}</div>`);
  const root = document.getElementById("root");
  if (!root) return { html, manifest: [] };
  const images = Array.from(root.querySelectorAll("img")).slice(0, MAX_IMAGES);
  let index = 0;
  const manifest: ImageManifest[] = [];

  for (const img of images) {
    const src = img.getAttribute("src");
    if (!src || src.startsWith("data:")) {
      img.remove();
      continue;
    }
    const fetched = await fetchImageBytes(src);
    if (!fetched.ok || fetched.bytes.byteLength > MAX_EPUB_IMAGE_BYTES) {
      img.remove();
      continue;
    }
    const mime = fetched.mime;
    const ext =
      mime === "image/png"
        ? "png"
        : mime === "image/gif"
          ? "gif"
          : mime === "image/webp"
            ? "webp"
            : mime === "image/svg+xml"
              ? "svg"
              : "jpg";
    index += 1;
    const href = `images/img-${index}.${ext}`;
    zip.file(`OEBPS/${href}`, fetched.bytes);
    const id = `img${index}`;
    manifest.push({ id, href, type: mime });
    img.setAttribute("src", href);
  }

  const next = (root.innerHTML || "")
    .replace(/<img([^>]*?)>/gi, "<img$1/>")
    .replace(/<br>/gi, "<br/>")
    .replace(/<hr>/gi, "<hr/>");
  return { html: next, manifest };
}

export async function buildEpub(article: Article): Promise<EpubResult> {
  try {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    zip.file(
      "META-INF/container.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    );

    const xhtmlBody = toXhtmlFragment(article.contentHtml, article.canonicalUrl);
    const embedded = await embedImages(xhtmlBody, zip);

    const title = article.title || "Untitled";
    const author = article.author || article.siteName || "Unknown";
    const uuid = crypto.randomUUID();
    const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const dateLine = formatPublished(article.published);
    const sourceLine = xmlEscape(article.canonicalUrl);

    zip.file(
      "OEBPS/style.css",
      `body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5; margin: 1em; }
h1 { font-size: 1.45em; line-height: 1.25; margin: 0 0 0.4em; }
.meta { font-size: 0.9em; color: #444; margin: 0 0 1.2em; }
.source { font-size: 0.8em; word-break: break-all; margin-top: 0.4em; }
p { margin: 0 0 0.85em; }
img { max-width: 100%; height: auto; }
blockquote { margin: 0 0 1em 0.8em; padding-left: 0.8em; border-left: 2px solid #999; }
pre, code { font-family: monospace; font-size: 0.9em; }
hr { border: 0; border-top: 1px solid #ccc; margin: 1.4em 0; }`,
    );

    zip.file(
      "OEBPS/nav.xhtml",
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>Contents</title></head>
<body>
<nav epub:type="toc"><ol><li><a href="chapter.xhtml">${xmlEscape(title)}</a></li></ol></nav>
</body></html>`,
    );

    zip.file(
      "OEBPS/chapter.xhtml",
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <title>${xmlEscape(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>${xmlEscape(title)}</h1>
  <p class="meta">${xmlEscape(author)}${dateLine ? ` · ${xmlEscape(dateLine)}` : ""} · ${xmlEscape(article.siteName)}</p>
  <p class="source">Source: <a href="${sourceLine}">${sourceLine}</a></p>
  <hr/>
  ${embedded.html}
</body>
</html>`,
    );

    const imageItems = embedded.manifest
      .map((img) => `    <item id="${img.id}" href="${img.href}" media-type="${img.type}"/>`)
      .join("\n");

    zip.file(
      "OEBPS/content.opf",
      `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${xmlEscape(title)}</dc:title>
    <dc:creator>${xmlEscape(author)}</dc:creator>
    <dc:language>en</dc:language>
    <dc:publisher>Quarto</dc:publisher>
    <dc:source>${sourceLine}</dc:source>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
${imageItems}
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`,
    );

    const bytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    const base64 = Buffer.from(bytes).toString("base64");
    return {
      ok: true,
      filename: slugFilename(title),
      mime: "application/epub+zip",
      base64,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not bind the EPUB.",
    };
  }
}
