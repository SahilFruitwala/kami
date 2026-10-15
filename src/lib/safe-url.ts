const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

// Cloud metadata endpoints reachable via hostname (not just 169.254.169.254).
const BLOCKED_EXACT_HOSTS = new Set([
  "metadata.google.internal",
  "metadata.google.com",
  "instance-data",
  "instance-data-compute",
  "169.254.169.254",
]);

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const oct = m.slice(1).map(Number);
  if (oct.some((n) => n > 255)) return false;
  const [a, b] = oct;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  // Azure IMDS / Wire Server (not RFC1918, but host-local metadata).
  if (a === 168 && b === 63) return true;
  const c = oct[2];
  // IETF protocol assignments (192.0.0.0/24) and the documentation nets.
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  // Benchmarking (198.18.0.0/15).
  if (a === 198 && (b === 18 || b === 19)) return true;
  // Multicast (224/4), reserved (240/4) and broadcast.
  if (a >= 224) return true;
  return false;
}

/**
 * Parse a numeric-label part (`2130706433`, `0x7f`, `0177`, `123`) as an IPv4
 * octet/value, mirroring how browsers/`getaddrinfo` interpret alternative IP
 * encodings attackers use to dodge denylist string matching.
 */
function parseNumericLabel(part: string): number | null {
  const p = part.trim().toLowerCase();
  if (!p) return null;
  if (/^0x[0-9a-f]+$/.test(p)) {
    const n = parseInt(p, 16);
    return Number.isSafeInteger(n) ? n : null;
  }
  if (/^0[0-7]+$/.test(p) && p.length > 1) {
    const n = parseInt(p, 8);
    return Number.isSafeInteger(n) ? n : null;
  }
  if (/^\d+$/.test(p)) {
    const n = parseInt(p, 10);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

/**
 * Detect dotted/decimal/hex/octal IPv4 encodings (`0x7f.0.0.1`, `0177.0.0.1`,
 * `2130706433`, `0x7f000001`) and report whether they resolve to a
 * non-public address. Returns true when the host *looks like* a numeric IP
 * that maps to loopback/private/link-local/reserved space.
 */
function isObfuscatedPrivateIPv4(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  // Single-integer form: http://2130706433/ == 127.0.0.1
  if (/^(0x[0-9a-f]+|0[0-7]*|\d+)$/.test(h)) {
    const n = parseNumericLabel(h);
    if (n == null || n < 0 || n > 0xffffffff) return false;
    const a = (n >>> 24) & 0xff;
    const b = (n >>> 16) & 0xff;
    return isPrivateIPv4(`${a}.${b}.${(n >>> 8) & 0xff}.${n & 0xff}`);
  }
  const labels = h.split(".");
  if (labels.length === 0 || labels.length > 4) return false;
  // Every label must be numeric (decimal/octal/hex) to be an IP encoding.
  const nums: number[] = [];
  for (const label of labels) {
    const n = parseNumericLabel(label);
    if (n == null) return false;
    nums.push(n);
  }
  // Expand shorthand (`127.1` → `127.0.0.1`, `10.1` etc.) the way inet_aton does.
  let octets: number[];
  if (nums.length === 4) {
    if (nums.some((n) => n > 255)) return false;
    octets = nums;
  } else if (nums.length === 3) {
    const [a, b, c] = nums;
    if (a > 255 || b > 255 || c > 0xffff) return false;
    octets = [a, b, (c >> 8) & 0xff, c & 0xff];
  } else if (nums.length === 2) {
    const [a, b] = nums;
    if (a > 255 || b > 0xffffff) return false;
    octets = [a, (b >> 16) & 0xff, (b >> 8) & 0xff, b & 0xff];
  } else {
    return false; // single-label handled above
  }
  return isPrivateIPv4(octets.join("."));
}

/**
 * Parse an IPv6 literal (`::` compression, embedded dotted IPv4 tail, optional
 * `%zone`) into eight 16-bit groups, or null when it isn't one.
 */
function parseIPv6(host: string): number[] | null {
  const h = host.toLowerCase().replace(/%.*$/, "");
  if (!h.includes(":") || !/^[0-9a-f:.]+$/.test(h)) return null;
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (!part) return [];
    const out: number[] = [];
    const pieces = part.split(":");
    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i]!;
      if (i === pieces.length - 1 && piece.includes(".")) {
        const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(piece);
        if (!m) return null;
        const o = m.slice(1).map(Number);
        if (o.some((n) => n > 255)) return null;
        out.push((o[0]! << 8) | o[1]!, (o[2]! << 8) | o[3]!);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
      out.push(parseInt(piece, 16));
    }
    return out;
  };
  const head = toGroups(halves[0]!);
  const tail = halves.length === 2 ? toGroups(halves[1]!) : [];
  if (!head || !tail) return null;
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    return [...head, ...new Array<number>(fill).fill(0), ...tail];
  }
  return head.length === 8 ? head : null;
}

function v4FromGroups(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/**
 * True for IPv6 literals that are not plain public unicast: loopback,
 * unspecified, link/site-local, ULA, multicast, documentation, discard, and
 * every form that embeds an IPv4 target (mapped, compatible, NAT64, 6to4,
 * Teredo) when that target is private — or always, where it can't be checked.
 */
function isPrivateIPv6(host: string): boolean {
  const g = parseIPv6(host);
  if (!g) return false;
  const [g0, g1] = g as [number, number];
  const zeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);
  // ::/128, ::1, and IPv4-compatible ::a.b.c.d (incl. hex form ::7f00:1).
  if (zeroPrefix(6)) return g[6] === 0 || isPrivateIPv4(v4FromGroups(g[6]!, g[7]!));
  // IPv4-mapped ::ffff:a.b.c.d
  if (zeroPrefix(5) && g[5] === 0xffff) return isPrivateIPv4(v4FromGroups(g[6]!, g[7]!));
  // NAT64 well-known prefix 64:ff9b::/96, and local-use 64:ff9b:1::/48.
  if (g0 === 0x64 && g1 === 0xff9b) {
    return g.slice(2, 6).every((x) => x === 0) ? isPrivateIPv4(v4FromGroups(g[6]!, g[7]!)) : true;
  }
  // 6to4 2002:AABB:CCDD::/48 carries the IPv4 in groups 1–2.
  if (g0 === 0x2002) return isPrivateIPv4(v4FromGroups(g1, g[2]!));
  // Teredo 2001:0::/32 (obfuscated IPv4) and documentation 2001:db8::/32.
  if (g0 === 0x2001 && (g1 === 0 || g1 === 0xdb8)) return true;
  // Discard-only 100::/64.
  if (g0 === 0x100 && g.slice(1, 4).every((x) => x === 0)) return true;
  if ((g0 & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g0 & 0xffc0) === 0xfec0) return true; // site-local fec0::/10
  if ((g0 & 0xff00) === 0xff00) return true; // multicast ff00::/8
  return false;
}

/**
 * Shared IP-literal denylist used by both the sync URL parser and the
 * server-side DNS resolution check.
 */
export function isBlockedIpLiteral(host: string): boolean {
  const bare = host
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
  return isPrivateIPv4(bare) || isObfuscatedPrivateIPv4(bare) || isPrivateIPv6(bare);
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That does not look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be saved.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const bare = host.replace(/\.$/, "");
  if (
    BLOCKED_HOSTS.has(bare) ||
    BLOCKED_EXACT_HOSTS.has(bare) ||
    bare === "localhost" ||
    bare.endsWith(".localhost") ||
    bare.endsWith(".local") ||
    bare.endsWith(".internal") ||
    bare.endsWith(".localdomain")
  ) {
    throw new Error("That address cannot be fetched.");
  }
  if (isBlockedIpLiteral(bare)) {
    throw new Error("That address cannot be fetched.");
  }
  return url;
}

/** True for a parseable http: or https: URL (no reachability checks). */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function absoluteUrl(src: string, base: string): string | null {
  try {
    const resolved = new URL(src.trim(), base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved.href;
  } catch {
    return null;
  }
}
