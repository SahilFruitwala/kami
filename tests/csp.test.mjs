import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { contentSecurityPolicy, newCspNonce } from "../src/lib/csp.ts";

const csp = contentSecurityPolicy("TESTNONCE");

function directive(name) {
  const match = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  assert.ok(match, `missing CSP directive ${name}`);
  return match;
}

describe("production CSP allows Clerk custom Frontend API", () => {
  it("includes the Kami Clerk FAPI host in script-src, connect-src, and frame-src", () => {
    const fapi = "https://clerk.kami.sahilfruitwala.com";
    for (const name of ["script-src", "connect-src", "frame-src"]) {
      assert.match(directive(name), new RegExp(fapi.replaceAll(".", "\\.")));
    }
  });

  it("allows Clerk bot protection and workers", () => {
    assert.match(directive("script-src"), /https:\/\/challenges\.cloudflare\.com/);
    assert.match(directive("script-src"), /https:\/\/\*\.protect\.clerk\.com/);
    assert.match(directive("connect-src"), /https:\/\/\*\.protect\.clerk\.com:\*/);
    assert.match(directive("worker-src"), /'self' blob:/);
  });
});

describe("production CSP stays minimal", () => {
  it("does not allow hosts only the server talks to", () => {
    for (const host of [
      "r.jina.ai",
      "fxtwitter.com",
      "vxtwitter.com",
      "publish.twitter.com",
      "fonts.googleapis.com",
    ]) {
      assert.ok(!csp.includes(host), `CSP should not list ${host}`);
    }
  });
});

describe("nonce-based script policy", () => {
  it("allows inline scripts only by nonce", () => {
    assert.match(directive("script-src"), /'nonce-TESTNONCE'/);
    assert.ok(!directive("script-src").includes("'unsafe-inline'"));
    assert.ok(!directive("script-src").includes("'unsafe-eval'"));
    assert.match(directive("object-src"), /'none'/);
    assert.match(directive("frame-ancestors"), /'none'/);
  });

  it("mints a fresh 128-bit nonce each time", () => {
    const a = newCspNonce();
    assert.equal(Buffer.from(a, "base64").length, 16);
    assert.notEqual(a, newCspNonce());
  });

  it("is set per response, not as a static vercel.json header", () => {
    const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    const global = vercel.headers.find((entry) => entry.source === "/(.*)").headers;
    assert.ok(!global.some((h) => h.key === "Content-Security-Policy"));
  });
});
