import { assertPublicFetchUrl } from "./safe-url.server.ts";

import { FETCH_TIMEOUT_MS, USER_AGENT } from "./fetch-image.server.ts";

const MAX_HTML_BYTES = 2_000_000;

export class BodyTooLargeError extends Error {
  constructor() {
    super("That page is too large to convert.");
    this.name = "BodyTooLargeError";
  }
}

export type SafeFetchResult = {
  status: number;
  headers: Headers;
  finalUrl: string;
  /** Every hop was a permanent redirect (301/308) — callers may adopt `finalUrl`. */
  permanentRedirect: boolean;
  /** Raw body bytes; empty for 304 Not Modified. */
  bytes: Uint8Array;
};

/**
 * SSRF-safe GET that returns non-2xx statuses (304, 429, …) instead of
 * throwing, so callers like the feed poller can do conditional requests and
 * honor Retry-After. Bodies are read with a hard byte cap.
 */
export async function safeFetch(
  url: string,
  opts: {
    accept: string;
    headers?: Record<string, string>;
    maxRedirects?: number;
    maxBytes?: number;
    timeoutMs?: number;
  },
): Promise<SafeFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 5;
  const maxBytes = opts.maxBytes ?? MAX_HTML_BYTES;
  // Manual redirect chain so every hop is re-validated against the SSRF
  // denylist **and** DNS resolution — `fetch(..., { redirect: "follow" })`
  // would silently follow a redirect from a public URL to a private/metadata
  // address (or a name that rebinds to one).
  let current = (await assertPublicFetchUrl(url)).href;
  let permanentRedirect = true;
  let redirected = false;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": USER_AGENT,
        accept: opts.accept,
        "accept-language": "en-US,en;q=0.9",
        ...opts.headers,
      },
    });
    if (res.status >= 300 && res.status < 400 && res.status !== 304) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!location) throw new Error("That page redirected to an invalid address.");
      let next: string;
      try {
        next = new URL(location, current).href;
      } catch {
        throw new Error("That page redirected to an invalid address.");
      }
      try {
        current = (await assertPublicFetchUrl(next)).href;
      } catch {
        throw new Error("That page redirected to an address that cannot be fetched.");
      }
      if (hop === maxRedirects) throw new Error("That page redirected too many times.");
      redirected = true;
      if (res.status !== 301 && res.status !== 308) permanentRedirect = false;
      continue;
    }
    // Validate the final URL after any server-side internal rewrites.
    try {
      const finalHref = res.url || current;
      current = (await assertPublicFetchUrl(finalHref)).href;
    } catch {
      await res.body?.cancel().catch(() => undefined);
      throw new Error("That address cannot be fetched.");
    }
    const bytes =
      res.status === 304 || !res.ok
        ? (await res.body?.cancel().catch(() => undefined), new Uint8Array())
        : await readCapped(res, maxBytes);
    return {
      status: res.status,
      headers: res.headers,
      finalUrl: current,
      permanentRedirect: redirected && permanentRedirect,
      bytes,
    };
  }
  throw new Error("That page redirected too many times.");
}

/** Read a response body, aborting as soon as it exceeds `maxBytes`. */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new BodyTooLargeError();
  }
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function fetchText(
  url: string,
  accept: string,
  extraHeaders: Record<string, string> = {},
  maxRedirects = 5,
): Promise<{ text: string; finalUrl: string; contentType: string }> {
  const res = await safeFetch(url, { accept, headers: extraHeaders, maxRedirects });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`The page returned ${res.status}.`);
  }
  const text = new TextDecoder("utf-8").decode(res.bytes);
  return { text, finalUrl: res.finalUrl, contentType: res.headers.get("content-type") ?? "" };
}
