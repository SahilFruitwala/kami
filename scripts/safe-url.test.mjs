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
      "http://168.63.4.4/",
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

  it("blocks reserved IPv4 ranges", () => {
    for (const ip of [
      "198.18.0.1",
      "198.19.255.255",
      "192.0.0.170",
      "192.0.2.1",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
    ]) {
      assert.equal(isBlockedIpLiteral(ip), true, ip);
    }
  });

  it("blocks IPv6 forms that embed a private IPv4 target", () => {
    for (const ip of [
      "::7f00:1", // IPv4-compatible, hex (what URL() normalizes ::127.0.0.1 to)
      "::ffff:7f00:1",
      "0:0:0:0:0:ffff:a00:1",
      "64:ff9b::a9fe:a9fe", // NAT64 → 169.254.169.254
      "64:ff9b:1::1", // local-use NAT64
      "2002:7f00:1::", // 6to4 → 127.0.0.1
      "2001:0:1:2::", // Teredo
      "fe80::1%eth0",
      "ff02::1",
      "100::1",
    ]) {
      assert.equal(isBlockedIpLiteral(ip), true, ip);
    }
    assert.throws(() => assertPublicHttpUrl("http://[::127.0.0.1]/"), /cannot be fetched/);
  });

  it("allows public IPv6 and public embedded IPv4", () => {
    for (const ip of ["2606:4700::1111", "64:ff9b::808:808", "2002:808:808::1", "::ffff:8.8.8.8"]) {
      assert.equal(isBlockedIpLiteral(ip), false, ip);
    }
  });
});
