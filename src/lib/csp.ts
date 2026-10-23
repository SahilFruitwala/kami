/**
 * Content-Security-Policy for HTML pages, set per response by the request
 * middleware in `src/start.ts` (not `vercel.json`): every page gets a fresh
 * nonce, so `script-src` needs no `'unsafe-inline'`. The router passes the
 * nonce to TanStack's hydration scripts, Clerk's init state and the theme
 * script (`router.options.ssr.nonce`).
 */

const CLERK_HOSTS = [
  "https://clerk.kami.sahilfruitwala.com",
  "https://*.clerk.com",
  "https://*.clerk.accounts.dev",
];

export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    [
      "script-src 'self'",
      `'nonce-${nonce}'`,
      ...CLERK_HOSTS,
      "https://challenges.cloudflare.com",
      "https://*.protect.clerk.com",
    ].join(" "),
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    // Narration audio plays straight from private R2 via presigned URLs.
    "media-src 'self' https://*.r2.cloudflarestorage.com",
    ["connect-src 'self'", ...CLERK_HOSTS, "https://*.protect.clerk.com:*"].join(" "),
    [
      "frame-src",
      ...CLERK_HOSTS,
      "https://challenges.cloudflare.com",
      "https://*.protect.clerk.com",
    ].join(" "),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** 128-bit base64 nonce (Web Crypto — works in every runtime). */
export function newCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw);
}
