import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { ExtractResult } from "@/lib/article-types.ts";

/**
 * Shared Quarto API (Hono). Mounted at `/api/v1` in TanStack Start for local /
 * App Builder preview, and exported from `worker/` for Cloudflare Workers.
 */
export function createQuartoApi() {
  const app = new Hono().basePath("/api/v1");

  app.use(
    "*",
    cors({
      origin: (origin) => origin || "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    }),
  );

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "quarto-api",
    }),
  );

  app.post("/extract", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Expected JSON body with a url." } satisfies ExtractResult, 400);
    }
    const parsed = z
      .object({ url: z.string().trim().min(4, "Paste a URL first.") })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        { ok: false, error: parsed.error.issues[0]?.message || "Invalid URL." } satisfies ExtractResult,
        400,
      );
    }
    const { extractArticleFromUrl } = await import("@/lib/extract.server.ts");
    const result = await extractArticleFromUrl(parsed.data.url);
    return c.json(result, result.ok ? 200 : 422);
  });

  app.post("/import", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Expected JSON body." } satisfies ExtractResult, 400);
    }
    const parsed = z
      .object({
        url: z.string().trim().optional(),
        title: z.string().trim().min(1).max(300),
        contentHtml: z.string().optional(),
        contentText: z.string().optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message || "Title and content are required.",
        } satisfies ExtractResult,
        400,
      );
    }
    const html = parsed.data.contentHtml?.trim() || "";
    const text = parsed.data.contentText?.trim() || "";
    if (!html && !text) {
      return c.json(
        { ok: false, error: "Paste article HTML or plain text." } satisfies ExtractResult,
        400,
      );
    }
    const { articleFromManualImport } = await import("@/lib/extract.server.ts");
    try {
      const article = articleFromManualImport({
        url: parsed.data.url?.trim() || undefined,
        title: parsed.data.title,
        contentHtml: html || undefined,
        contentText: text || undefined,
      });
      return c.json({ ok: true, article } satisfies ExtractResult);
    } catch (err) {
      return c.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Could not import that article.",
        } satisfies ExtractResult,
        400,
      );
    }
  });

  app.post("/link", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Expected JSON body with a url." } satisfies ExtractResult, 400);
    }
    const parsed = z
      .object({
        url: z.string().trim().min(4),
        title: z.string().trim().max(300).optional(),
      })
      .safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, error: "Paste a URL first." } satisfies ExtractResult, 400);
    }
    const { articleFromLinkOnly } = await import("@/lib/extract.server.ts");
    try {
      const article = articleFromLinkOnly(parsed.data.url, parsed.data.title);
      return c.json({ ok: true, article } satisfies ExtractResult);
    } catch (err) {
      return c.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Invalid URL.",
        } satisfies ExtractResult,
        400,
      );
    }
  });

  app.get("/img", async (c) => {
    const raw = c.req.query("u");
    if (!raw) return c.text("missing url", 400);
    const { fetchImageBytes } = await import("@/lib/fetch-image.server.ts");
    const result = await fetchImageBytes(raw);
    if (!result.ok) {
      const status = (result.status === 404 || result.status === 400 || result.status === 415
        ? result.status
        : 502) as 400 | 404 | 415 | 502;
      return c.text(result.error, status);
    }
    return new Response(result.bytes.slice(), {
      headers: {
        "content-type": result.mime,
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  });

  app.notFound((c) => c.json({ ok: false, error: "Not found." }, 404));

  return app;
}
