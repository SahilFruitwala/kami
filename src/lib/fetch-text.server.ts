import { assertPublicFetchUrl } from "./safe-url.server.ts";

import { FETCH_TIMEOUT_MS, USER_AGENT } from "./fetch-image.server.ts";

const MAX_HTML_BYTES = 2_000_000;

export async function fetchText(
  url: string,
  accept: string,
  extraHeaders: Record<string, string> = {},
  maxRedirects = 5,
): Promise<{ text: string; finalUrl: string; contentType: string }> {
  // Manual redirect chain so every hop is re-validated against the SSRF
  // denylist **and** DNS resolution — `fetch(..., { redirect: "follow" })`
  // would silently follow a redirect from a public URL to a private/metadata
  // address (or a name that rebinds to one).
  let current = (await assertPublicFetchUrl(url)).href;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": USER_AGENT,
        accept,
        "accept-language": "en-US,en;q=0.9",
        ...extraHeaders,
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.arrayBuffer().catch(() => undefined);
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
      continue;
    }
    if (!res.ok) {
      throw new Error(`The page returned ${res.status}.`);
    }
    // Validate the final URL after any server-side internal rewrites.
    try {
      const finalHref = res.url || current;
      current = (await assertPublicFetchUrl(finalHref)).href;
    } catch {
      throw new Error("That address cannot be fetched.");
    }
    const contentType = res.headers.get("content-type") ?? "";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_HTML_BYTES) {
      throw new Error("That page is too large to convert.");
    }
    const text = new TextDecoder("utf-8").decode(buf);
    return { text, finalUrl: current, contentType };
  }
  throw new Error("That page redirected too many times.");
}
