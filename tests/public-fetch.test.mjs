import assert from "node:assert/strict";
import dns from "node:dns/promises";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { publicFetch, publicOnlyLookup } from "../src/lib/safe-url.server.ts";

// Stub resolver: the lookup must vet the very answers the socket connects to.
const answers = {
  "public.test": [{ address: "93.184.216.34", family: 4 }],
  "rebind.test": [
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ],
  "loopback.test": [{ address: "127.0.0.1", family: 4 }],
};
const realLookup = dns.lookup;
before(() => {
  dns.lookup = async (host) => answers[host] ?? [];
});
after(() => {
  dns.lookup = realLookup;
});

const lookup = (host, options) =>
  new Promise((resolve) => publicOnlyLookup(host, options, (...args) => resolve(args)));

describe("publicOnlyLookup", () => {
  it("returns every vetted address when asked for all", async () => {
    const [err, addresses] = await lookup("public.test", { all: true });
    assert.equal(err, null);
    assert.deepEqual(addresses, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("returns a single address otherwise", async () => {
    const [err, address, family] = await lookup("public.test", {});
    assert.equal(err, null);
    assert.equal(address, "93.184.216.34");
    assert.equal(family, 4);
  });

  it("refuses names with any private answer (DNS rebinding)", async () => {
    for (const host of ["rebind.test", "loopback.test", "missing.test"]) {
      const [err] = await lookup(host, { all: true });
      assert.match(err.message, /cannot be fetched/, host);
    }
  });
});

describe("publicFetch", () => {
  let server;
  let port;
  before(async () => {
    server = http.createServer((_req, res) => res.end("internal"));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
  });
  after(() => server.close());

  it("never connects to a name that resolves to loopback", async () => {
    await assert.rejects(publicFetch(`http://loopback.test:${port}/`), (err) =>
      /cannot be fetched/.test(err.cause?.message ?? err.message),
    );
  });

  it("refuses private IP-literal hosts itself", async () => {
    await assert.rejects(publicFetch(`http://127.0.0.1:${port}/`), /cannot be fetched/);
  });
});
