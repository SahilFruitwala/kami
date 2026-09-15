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

function consider(raw: string | null, baseUrl: string, baseScore: number, into: { url: string; score: number }[]) {
  if (!raw) return;
  for (const part of raw.split(",")) {
    const bits = part.trim().split(/\s+/);
    if (!bits[0]) continue;
    const abs = absoluteUrl(bits[0], baseUrl);
    if (!abs || abs.startsWith("data:") || isJunkImageUrl(abs)) continue;
    let extra = 0;
    const desc = bits[1] || "";
    if (desc.endsWith("w")) extra = parseInt(desc, 10) || 0;
    else if (desc.endsWith("x")) extra = Math.round((parseFloat(desc) || 1) * 400);
    into.push({ url: abs, score: baseScore + extra });
  }
}

export function pickImageSrc(el: Element, baseUrl: string): string | null {
  const scored: { url: string; score: number }[] = [];
  consider(el.getAttribute("srcset"), baseUrl, 200, scored);
  consider(el.getAttribute("data-srcset"), baseUrl, 150, scored);
  consider(el.getAttribute("data-src"), baseUrl, 80, scored);
  consider(el.getAttribute("data-original"), baseUrl, 80, scored);
  consider(el.getAttribute("data-lazy-src"), baseUrl, 70, scored);
  consider(el.getAttribute("data-image"), baseUrl, 60, scored);
  consider(el.getAttribute("src"), baseUrl, 10, scored);
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  return preferReadableImage(scored[0].url);
}

export function previewImageSrc(original: string): string {
  if (!original || original.startsWith("data:") || original.startsWith("/api/img")) {
    return original;
  }
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
