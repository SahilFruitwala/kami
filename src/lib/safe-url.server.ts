import dns from "node:dns/promises";
import { assertPublicHttpUrl, isBlockedIpLiteral } from "./safe-url.ts";

/**
 * Server-only SSRF guard: hostname denylist **plus** DNS resolution check.
 *
 * `assertPublicHttpUrl` alone is necessary but not sufficient — an attacker can
 * point a public DNS name at `127.0.0.1` / link-local / cloud metadata. Call
 * this before every outbound fetch (and again on every redirect hop).
 *
 * Keep the `.server.ts` suffix so Vite never ships `node:dns` to the browser.
 */
export async function assertPublicFetchUrl(raw: string): Promise<URL> {
  const url = assertPublicHttpUrl(raw);
  await assertHostnameResolvesPublic(url.hostname);
  return url;
}

async function assertHostnameResolvesPublic(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  // Literal IPs were already vetted by assertPublicHttpUrl — no DNS needed.
  if (isBlockedIpLiteral(host) || looksLikeIpLiteral(host)) return;

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("That address cannot be fetched.");
  }
  if (addresses.length === 0) {
    throw new Error("That address cannot be fetched.");
  }
  for (const { address } of addresses) {
    if (isBlockedIpLiteral(address)) {
      throw new Error("That address cannot be fetched.");
    }
  }
}

function looksLikeIpLiteral(host: string): boolean {
  if (host.includes(":")) return true;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}
