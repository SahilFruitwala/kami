const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

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
  if (/^0x[0-9a-f]+$/.test(p)) return parseInt(p, 16);
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
  if (
    isPrivateIPv4(bare) ||
    isObfuscatedPrivateIPv4(bare) ||
    bare.startsWith("fe80:") ||
    bare.startsWith("fec0:") ||
    bare.startsWith("fc") ||
    bare.startsWith("fd") ||
    bare === "::" ||
    bare.startsWith("::ffff:")
  ) {
    throw new Error("That address cannot be fetched.");
  }
  return url;
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
