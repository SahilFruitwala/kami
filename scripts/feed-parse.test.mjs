import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discoverFeedLinks, guessFeedUrls, parseFeed } from "../src/lib/feed-parse.server.ts";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <atom:link href="https://ex.com/feed" rel="self" type="application/rss+xml"/>
  <title>Example &amp; Co</title>
  <link>https://ex.com/</link>
  <ttl>120</ttl>
  <item>
    <title><![CDATA[First <em>post</em>]]></title>
    <link>/posts/1</link>
    <dc:creator>Ada</dc:creator>
    <guid isPermaLink="false">post-1</guid>
    <pubDate>Mon, 06 Sep 2021 16:45:00 +0000</pubDate>
    <description><![CDATA[<p>Short teaser</p>]]></description>
    <content:encoded><![CDATA[<p>Full body <img src="/img/a.jpg"></p>]]></content:encoded>
  </item>
  <item>
    <title>Second</title>
    <guid>https://ex.com/posts/2</guid>
    <media:thumbnail url="https://cdn.ex.com/2.jpg"/>
    <description>Plain &lt;b&gt;escaped&lt;/b&gt; html</description>
  </item>
</channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title type="text">Atom Blog</title>
  <link rel="self" href="https://a.dev/atom.xml"/>
  <link rel="alternate" href="https://a.dev/"/>
  <entry>
    <title>Entry one</title>
    <link rel="alternate" href="https://a.dev/one"/>
    <id>tag:a.dev,2024:1</id>
    <updated>2024-01-02T03:04:05Z</updated>
    <author><name>Grace</name></author>
    <content type="html">&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;</content>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("parses RSS 2.0 with namespaces, relative links and CDATA", () => {
    const feed = parseFeed(RSS, "https://ex.com/feed");
    assert.ok(feed);
    assert.equal(feed.title, "Example & Co");
    assert.equal(feed.siteUrl, "https://ex.com/");
    assert.equal(feed.ttlMinutes, 120);
    assert.equal(feed.entries.length, 2);
    const [first, second] = feed.entries;
    assert.equal(first.title, "First post");
    assert.equal(first.url, "https://ex.com/posts/1");
    assert.equal(first.guid, "post-1");
    assert.equal(first.author, "Ada");
    assert.match(first.contentHtml, /Full body/);
    assert.equal(first.excerpt, "Short teaser");
    assert.equal(first.imageUrl, "https://ex.com/img/a.jpg");
    assert.equal(first.publishedAt, Date.UTC(2021, 8, 6, 16, 45));
    // isPermaLink guid doubles as the link; no date → null.
    assert.equal(second.url, "https://ex.com/posts/2");
    assert.equal(second.imageUrl, "https://cdn.ex.com/2.jpg");
    assert.equal(second.publishedAt, null);
    assert.equal(second.excerpt, "Plain escaped html");
  });

  it("parses Atom with html content and the alternate link", () => {
    const feed = parseFeed(ATOM, "https://a.dev/atom.xml");
    assert.ok(feed);
    assert.equal(feed.title, "Atom Blog");
    assert.equal(feed.siteUrl, "https://a.dev/");
    const [entry] = feed.entries;
    assert.equal(entry.url, "https://a.dev/one");
    assert.equal(entry.guid, "tag:a.dev,2024:1");
    assert.equal(entry.author, "Grace");
    assert.equal(entry.contentHtml, "<p>Hello &amp; welcome</p>");
    assert.equal(entry.excerpt, "Hello & welcome");
  });

  it("parses JSON Feed", () => {
    const feed = parseFeed(
      JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "J",
        home_page_url: "https://j.io/",
        items: [{ id: "1", url: "/p/1", title: "One", content_text: "Hi there\n\nAgain" }],
      }),
      "https://j.io/feed.json",
    );
    assert.ok(feed);
    assert.equal(feed.entries[0].url, "https://j.io/p/1");
    assert.equal(feed.entries[0].contentHtml, "<p>Hi there</p><p>Again</p>");
  });

  it("rejects HTML pages and junk", () => {
    assert.equal(parseFeed("<!doctype html><html><body>hi</body></html>", "https://x.io"), null);
    assert.equal(parseFeed("not a feed", "https://x.io"), null);
    assert.equal(parseFeed('{"hello":1}', "https://x.io"), null);
  });

  it("drops non-http links", () => {
    const feed = parseFeed(
      RSS.replace("<link>/posts/1</link>", "<link>javascript:alert(1)</link>"),
      "https://ex.com/feed",
    );
    assert.equal(feed?.entries[0].url, "");
  });
});

describe("feed discovery", () => {
  it("finds alternate links, main feed before comments", () => {
    const html = `<head>
      <link rel="alternate" type="application/rss+xml" title="Comments" href="/comments/feed">
      <link rel="alternate" type="application/rss+xml" title="Posts" href="/feed">
      <link rel="stylesheet" href="/s.css">
      <link rel='alternate' type='application/atom+xml' href='https://cdn.x.io/atom.xml'>
    </head>`;
    assert.deepEqual(discoverFeedLinks(html, "https://x.io/blog/"), [
      "https://x.io/feed",
      "https://cdn.x.io/atom.xml",
      "https://x.io/comments/feed",
    ]);
  });

  it("guesses conventional paths", () => {
    const guesses = guessFeedUrls("https://x.io/blog/");
    assert.equal(guesses[0], "https://x.io/blog/feed");
    assert.ok(guesses.includes("https://x.io/rss.xml"));
  });
});
