import { absoluteUrl } from "./safe-url.ts";

const JUNK =
  /enwiki-|wikipedia-wordmark|wikipedia-tagline|\/static\/images\/icons\/|1x1|pixel\.gif|spacer|doubleclick|scorecardresearch|facebook\.com\/tr|analytics|gravatar\.com\/avatar/i;

export function isJunkImageUrl(url: string): boolean {
  return JUNK.test(url);
}

export function preferReadableImage(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith("utm_")) u.searchParams.delete(key);
    }

    if (u.hostname.endsWith("twimg.com")) {
      const name = u.searchParams.get("name");
      if (!name || name === "small" || name === "thumb" || name === "tiny") {
        u.searchParams.set("name", "medium");
      }
      if (!u.searchParams.get("format") && !/\.(jpg|jpeg|png|webp|gif)$/i.test(u.pathname)) {
        u.searchParams.set("format", "jpg");
      }
    }

    if (u.hostname.endsWith("wikimedia.org") || u.hostname.endsWith("wikipedia.org")) {
      u.pathname = u.pathname.replace(/\/(\d+)px-/g, (_m, n: string) => {
        const width = Number(n);
        if (width > 0 && width < 400) return "/640px-";
        return `/${n}px-`;
      });
      if (/\.svg$/i.test(u.pathname) && !u.pathname.includes("/thumb/")) {
        const file = u.pathname.split("/").pop() || "";
        const parts = u.pathname.split("/");
        const commonsIdx = parts.findIndex((p) => p === "commons" || p === "en");
        if (commonsIdx >= 0 && file) {
          const hashPath = parts.slice(commonsIdx + 1).join("/");
          u.hostname = u.hostname.includes("thumb.") ? u.hostname : "upload.wikimedia.org";
          u.pathname = `/wikipedia/commons/thumb/${hashPath}/800px-${file}.png`;
        }
      }
    }

    return u.href;
  } catch {
    return url;
  }
}

/**
 * Parse a srcset per the HTML spec's candidate rules: a URL is a run of
 * non-whitespace (it may itself contain commas — Substack/Cloudinary CDN
 * URLs do), followed by optional descriptors up to the next comma.
 */
export function parseSrcset(raw: string): { url: string; descriptor: string }[] {
  const out: { url: string; descriptor: string }[] = [];
  let i = 0;
  const n = raw.length;
  while (i < n) {
    while (i < n && /[\s,]/.test(raw[i])) i += 1;
    if (i >= n) break;
    let start = i;
    while (i < n && !/\s/.test(raw[i])) i += 1;
    let url = raw.slice(start, i);
    let descriptor = "";
    if (/,$/.test(url)) {
      url = url.replace(/,+$/, "");
    } else {
      start = i;
      while (i < n && raw[i] !== ",") i += 1;
      descriptor = raw.slice(start, i).trim();
    }
    if (url) out.push({ url, descriptor });
  }
  return out;
}

function consider(
  raw: string | null,
  baseUrl: string,
  baseScore: number,
  into: { url: string; score: number }[],
  isSrcset = false,
) {
  if (!raw?.trim()) return;
  const candidates = isSrcset ? parseSrcset(raw) : [{ url: raw.trim(), descriptor: "" }];
  for (const { url, descriptor } of candidates) {
    const abs = absoluteUrl(url, baseUrl);
    if (!abs || abs.startsWith("data:") || isJunkImageUrl(abs)) continue;
    let extra = 0;
    if (descriptor.endsWith("w")) extra = parseInt(descriptor, 10) || 0;
    else if (descriptor.endsWith("x")) extra = Math.round((parseFloat(descriptor) || 1) * 400);
    into.push({ url: abs, score: baseScore + extra });
  }
}

export function pickImageSrc(el: Element, baseUrl: string): string | null {
  const scored: { url: string; score: number }[] = [];
  consider(el.getAttribute("srcset"), baseUrl, 200, scored, true);
  consider(el.getAttribute("data-srcset"), baseUrl, 150, scored, true);
  consider(el.getAttribute("data-src"), baseUrl, 80, scored);
  consider(el.getAttribute("data-original"), baseUrl, 80, scored);
  consider(el.getAttribute("data-lazy-src"), baseUrl, 70, scored);
  consider(el.getAttribute("data-image"), baseUrl, 60, scored);
  consider(el.getAttribute("src"), baseUrl, 10, scored);
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return preferReadableImage(scored[0].url);
}

/**
 * Articles saved before the srcset-comma fix hold Substack URLs chopped at a
 * comma and resolved against the post URL (".../p/fl_progressive:steep/https%3A…").
 * The real image URL survives, percent-encoded, in the tail — recover it.
 */
export function repairMangledImageUrl(url: string): string {
  const m = /^https?:\/\/[^/]+\/p\/[^/]*\/(https?%3A%2F%2F.+)$/i.exec(url);
  if (!m) return url;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return url;
  }
}

export function previewImageSrc(raw: string): string {
  if (!raw || raw.startsWith("data:") || raw.startsWith("/api/img")) {
    return raw;
  }
  const original = repairMangledImageUrl(raw);
  return `/api/img?u=${encodeURIComponent(original)}`;
}

export function rewriteHtmlImages(html: string): string {
  return html.replace(/<img\b([^>]*?)>/gi, (_full, attrs: string) => {
    const srcMatch = /\ssrc\s*=\s*(["'])(.*?)\1/i.exec(` ${attrs}`);
    if (!srcMatch) return `<img${attrs}>`;
    const next = previewImageSrc(srcMatch[2]);
    // Defense-in-depth: sanitized HTML should already carry only src/alt, but
    // strip any event-handler / JS-URL attributes if a caller passes raw HTML.
    const withoutSrc = attrs
      .replace(/\ssrc\s*=\s*(["']).*?\1/i, "")
      .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "")
      .replace(/\ssrcset\s*=\s*(["']).*?\1/gi, "");
    return `<img src="${next}" referrerpolicy="no-referrer" decoding="async"${withoutSrc}>`;
  });
}
