import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

// db.ts refuses to load without a URL; nothing here connects.
process.env.DATABASE_URL ||= "postgres://test@127.0.0.1:1/none";
const { HttpError, toErrorResponse } = await import("@/server/http");
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
