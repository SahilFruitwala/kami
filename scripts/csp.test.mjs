import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const csp = vercel.headers
  .find((entry) => entry.source === "/(.*)")
  .headers.find((h) => h.key === "Content-Security-Policy").value;

function directive(name) {
  const match = csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `));
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
    for (const host of ["r.jina.ai", "fxtwitter.com", "vxtwitter.com", "publish.twitter.com", "fonts.googleapis.com"]) {
      assert.ok(!csp.includes(host), `CSP should not list ${host}`);
    }
  });
});

describe("production CSP allows in-browser TTS (Kokoro)", () => {
  it("allows model downloads from Hugging Face and its CDN", () => {
    assert.match(directive("connect-src"), /https:\/\/huggingface\.co/);
    assert.match(directive("connect-src"), /https:\/\/\*\.hf\.co/);
  });

  it("allows the ONNX runtime wasm and its loader from jsDelivr", () => {
    assert.match(directive("connect-src"), /https:\/\/cdn\.jsdelivr\.net/);
    assert.match(directive("script-src"), /https:\/\/cdn\.jsdelivr\.net/);
    assert.match(directive("script-src"), /'wasm-unsafe-eval'/);
  });
});
