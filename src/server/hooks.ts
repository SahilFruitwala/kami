import "@tanstack/react-start/server-only";
import { timingSafeEqual } from "node:crypto";
import { HttpError, json } from "@/server/http";

/**
 * Machine-to-machine endpoints under `/api/hooks/*` (Vercel Cron, inbound
 * email providers). They carry no Clerk session, so instead of `apiHandler`
 * they authenticate with a shared secret from the environment, accepted as
 *
 *   Authorization: Bearer <secret>          (Vercel Cron, generic workers)
 *   Authorization: Basic <any:secret>       (Postmark's https://user:pass@ URLs)
 *
 * `/api/hooks/*` is excluded from the browser CSRF middleware (`src/start.ts`)
 * because these callers send no Origin / Sec-Fetch headers. An unset secret
 * disables the hook (503) rather than leaving it open.
 */

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function presentedSecret(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, value = ""] = header.split(/\s+/, 2);
  if (/^bearer$/i.test(scheme ?? "")) return value || null;
  if (/^basic$/i.test(scheme ?? "")) {
    try {
      const decoded = Buffer.from(value, "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      return colon >= 0 ? decoded.slice(colon + 1) : decoded;
    } catch {
      return null;
    }
  }
  return null;
}

export function hookHandler(
  secretEnv: string,
  handler: (request: Request) => Promise<unknown>,
): (args: { request: Request }) => Promise<Response> {
  return async ({ request }) => {
    const secret = process.env[secretEnv]?.trim();
    if (!secret || secret.length < 16) {
      return json({ error: "This hook is not configured." }, { status: 503 });
    }
    const presented = presentedSecret(request);
    if (!presented || !safeEqual(presented, secret)) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      const result = await handler(request);
      return json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, { status: err.status });
      if (err instanceof Error && err.name === "RateLimitError") {
        return json({ error: err.message }, { status: 429 });
      }
      console.error("[hooks]", err);
      return json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

/** Read a JSON body with a byte cap (inbound mail can be large). */
export async function readJsonCapped(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "Payload too large.");
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Payload too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Malformed JSON body.");
  }
}
