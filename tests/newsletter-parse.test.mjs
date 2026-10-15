import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emailToEntry,
  findWebVersionUrl,
  normalizeInbound,
  stripEmailTracking,
  tokenFromRecipients,
} from "../src/lib/newsletter-parse.server.ts";

describe("normalizeInbound", () => {
  it("reads Postmark inbound JSON", () => {
    const mail = normalizeInbound({
      From: '"Brew" <crew@brew.com>',
      FromFull: { Email: "Crew@Brew.com", Name: "Brew" },
      ToFull: [{ Email: "abc123def456@in.kami.app" }],
      OriginalRecipient: "abc123def456+x@in.kami.app",
      Subject: "Hi",
      HtmlBody: "<p>x</p>",
      MessageID: "id-1",
    });
    assert.equal(mail.fromEmail, "crew@brew.com");
    assert.equal(mail.fromName, "Brew");
    assert.deepEqual(mail.recipients.slice(0, 2), [
      "abc123def456+x@in.kami.app",
      "abc123def456@in.kami.app",
    ]);
  });

  it("reads the generic shape and rejects junk", () => {
    const mail = normalizeInbound({
      to: ["A <abc123def456@in.kami.app>"],
      from: "Ben <ben@s.com>",
      text: "t",
    });
    assert.equal(mail.fromEmail, "ben@s.com");
    assert.equal(mail.fromName, "Ben");
    assert.equal(normalizeInbound({ hello: "world" }), null);
  });
});

describe("tokenFromRecipients", () => {
  it("matches our domain, strips +tags, rejects malformed tokens", () => {
    assert.equal(
      tokenFromRecipients(["x@other.com", "abc123def456+news@in.kami.app"], "in.kami.app"),
      "abc123def456",
    );
    assert.equal(tokenFromRecipients(["short@in.kami.app"], "in.kami.app"), null);
    assert.equal(tokenFromRecipients(["abc123def456@evil.app"], "in.kami.app"), null);
  });
});

describe("newsletter bodies", () => {
  it("finds the web version link but never an unsubscribe link", () => {
    assert.equal(
      findWebVersionUrl(
        '<a href="https://x.com/unsubscribe?u=1">View online</a><a href="https://x.com/p/1?a=1&amp;b=2">View this email in your browser</a>',
      ),
      "https://x.com/p/1?a=1&b=2",
    );
    assert.equal(findWebVersionUrl('<a href="https://x.com">Home</a>'), null);
  });

  it("strips tracking pixels and hidden preheaders, keeps real images", () => {
    const html = [
      '<div style="display:none;max-height:0">Preheader teaser</div>',
      '<img src="https://cdn.x.com/hero.jpg" width="600">',
      '<img src="https://t.x.com/open.gif">',
      '<img src="https://cdn.x.com/a.png" width="1" height="1">',
      '<img src="https://e.x.com/o/abc" alt="">',
      "<p>Body</p>",
    ].join("");
    const out = stripEmailTracking(html);
    assert.match(out, /hero\.jpg/);
    assert.doesNotMatch(out, /open\.gif|a\.png|\/o\/abc|Preheader/);
    assert.match(out, /<p>Body<\/p>/);
  });

  it("builds an entry, falling back to text and a content hash guid", () => {
    const entry = emailToEntry({
      recipients: [],
      fromEmail: "a@b.com",
      fromName: "A",
      subject: "Issue <b>42</b>",
      html: "",
      text: "First para.\n\nSecond <para>.",
      date: null,
      messageId: "",
    });
    assert.equal(entry.title, "Issue 42");
    assert.equal(entry.contentHtml, "<p>First para.</p><p>Second &lt;para>.</p>");
    assert.match(entry.guid, /^[0-9a-f]{64}$/);
    assert.equal(entry.url, "");
  });
});
