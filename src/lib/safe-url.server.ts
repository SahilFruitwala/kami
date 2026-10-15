import dns from "node:dns/promises";
import type { LookupFunction } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
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
  const host = hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
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

/**
 * DNS lookup for outbound sockets that refuses non-public answers. Because the
 * socket connects to exactly the address vetted here, a hostname can't pass
 * `assertPublicFetchUrl` with a public IP and then rebind to 127.0.0.1 /
 * 169.254.169.254 for the real connection (DNS rebinding / TOCTOU).
 */
export const publicOnlyLookup = ((hostname, options, callback) => {
  const family = typeof options === "object" && options ? options.family : undefined;
  const all = typeof options === "object" && options ? options.all === true : false;
  dns
    .lookup(hostname, { all: true, verbatim: true, family: family || 0 })
    .then((addresses) => {
      if (addresses.length === 0 || addresses.some((a) => isBlockedIpLiteral(a.address))) {
        const err = Object.assign(new Error("That address cannot be fetched."), {
          code: "EBLOCKEDADDRESS",
        });
        callback(err, "", 0);
        return;
      }
      if (all) (callback as unknown as (e: null, a: typeof addresses) => void)(null, addresses);
      else callback(null, addresses[0]!.address, addresses[0]!.family);
    })
    .catch((err: NodeJS.ErrnoException) => callback(err, "", 0));
}) as LookupFunction;

const publicDispatcher = new Agent({ connect: { lookup: publicOnlyLookup } });

/**
 * `fetch` for user-supplied URLs: every connection is pinned to an address
 * that passed the public-IP check. Still call `assertPublicFetchUrl` first
 * (and on every redirect hop) for early, friendly errors; IP-literal hosts
 * skip DNS and are covered by that check.
 */
export async function publicFetch(url: string, init: RequestInit = {}): Promise<Response> {
  // IP-literal hosts never reach the lookup above, so check them here too.
  if (isBlockedIpLiteral(new URL(url).hostname)) {
    throw new Error("That address cannot be fetched.");
  }
  return undiciFetch(url, {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: publicDispatcher,
  }) as unknown as Promise<Response>;
}
