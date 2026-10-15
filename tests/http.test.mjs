import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

// db.ts refuses to load without a URL; nothing here connects.
process.env.DATABASE_URL ||= "postgres://test@127.0.0.1:1/none";
const { HttpError, toErrorResponse } = await import("@/server/http");
const { hookHandler, presentedSecret } = await import("@/server/hooks");
const { RateLimitError } = await import("@/lib/rate-limit.server");

const body = (res) => res.json();
const quietly = async (fn) => {
  const orig = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = orig;
  }
};

describe("toErrorResponse", () => {
  it("maps known errors to their status and message", async () => {
    const zod = z.object({ a: z.string() }).safeParse({}).error;
    assert.equal(toErrorResponse(zod).status, 400);
    const http = toErrorResponse(new HttpError(409, "Taken"));
    assert.equal(http.status, 409);
    assert.deepEqual(await body(http), { error: "Taken" });
    const limited = toErrorResponse(new RateLimitError(7));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "7");
  });

  it("never leaks unexpected errors", async () => {
    const res = await quietly(() => toErrorResponse(new Error("SELECT * FROM secrets")));
    assert.equal(res.status, 500);
    assert.doesNotMatch((await body(res)).error, /SELECT/);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  });
});

describe("hookHandler", () => {
  const SECRET = "s".repeat(32);
  const call = (auth, handler = async () => ({ ran: true })) => {
    process.env.TEST_HOOK_SECRET = SECRET;
    const headers = auth ? { authorization: auth } : {};
    return hookHandler(
      "TEST_HOOK_SECRET",
      handler,
    )({
      request: new Request("https://kami.test/api/hooks/x", { method: "POST", headers }),
    });
  };

  it("is disabled (503) when the secret is unset or short", async () => {
    process.env.SHORT_SECRET = "short";
    const res = await hookHandler("SHORT_SECRET", async () => ({}))({
      request: new Request("https://kami.test/", { headers: { authorization: "Bearer short" } }),
    });
    assert.equal(res.status, 503);
  });

  it("rejects a missing or wrong secret", async () => {
    assert.equal((await call(null)).status, 401);
    assert.equal((await call(`Bearer ${"x".repeat(32)}`)).status, 401);
  });

  it("accepts Bearer and Basic credentials", async () => {
    assert.deepEqual(await body(await call(`Bearer ${SECRET}`)), { ran: true });
    const basic = Buffer.from(`user:${SECRET}`).toString("base64");
    assert.deepEqual(await body(await call(`Basic ${basic}`)), { ran: true });
  });

  it("maps handler errors like the API does", async () => {
    const limited = await call(`Bearer ${SECRET}`, async () => {
      throw new RateLimitError(3);
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "3");
    const bad = await call(`Bearer ${SECRET}`, async () => z.string().parse(1));
    assert.equal(bad.status, 400);
  });
});

describe("presentedSecret", () => {
  const req = (authorization) => new Request("https://kami.test/", { headers: { authorization } });
  it("reads the password half of Basic auth", () => {
    assert.equal(presentedSecret(req(`Basic ${Buffer.from("u:pw").toString("base64")}`)), "pw");
    assert.equal(presentedSecret(req("Token abc")), null);
  });
});
