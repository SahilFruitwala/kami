import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertPublicHttpUrl, isBlockedIpLiteral } from "../src/lib/safe-url.ts";

describe("assertPublicHttpUrl", () => {
  it("allows public https URLs", () => {
    const url = assertPublicHttpUrl("https://example.com/a");
    assert.equal(url.hostname, "example.com");
  });

  it("blocks loopback and private IPv4", () => {
    for (const raw of [
      "http://127.0.0.1/",
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/",
      "http://2130706433/",
      "http://0x7f000001/",
    ]) {
      assert.throws(() => assertPublicHttpUrl(raw), /cannot be fetched/);
    }
  });

  it("blocks localhost-style hostnames", () => {
    for (const raw of [
      "http://localhost/",
      "http://foo.localhost/",
      "http://printer.local/",
      "http://metadata.google.internal/",
    ]) {
      assert.throws(() => assertPublicHttpUrl(raw), /cannot be fetched/);
    }
  });

  it("does not false-positive on hostnames starting with fc/fd", () => {
    // Previously `bare.startsWith("fc")` blocked these as fake IPv6 ULA.
    assert.equal(assertPublicHttpUrl("https://fd.com/").hostname, "fd.com");
    assert.equal(assertPublicHttpUrl("https://fcbarcelona.com/").hostname, "fcbarcelona.com");
  });

  it("blocks unique-local IPv6 literals", () => {
    assert.throws(() => assertPublicHttpUrl("http://[fc00::1]/"), /cannot be fetched/);
    assert.throws(() => assertPublicHttpUrl("http://[fd12:3456::1]/"), /cannot be fetched/);
  });
});

describe("isBlockedIpLiteral", () => {
  it("flags private and mapped addresses", () => {
    assert.equal(isBlockedIpLiteral("10.1.2.3"), true);
    assert.equal(isBlockedIpLiteral("8.8.8.8"), false);
    assert.equal(isBlockedIpLiteral("::1"), true);
    assert.equal(isBlockedIpLiteral("::ffff:127.0.0.1"), true);
  });
});
