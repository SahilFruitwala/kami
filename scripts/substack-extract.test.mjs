import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { articleFromCapturedPage } from "../src/lib/extract.server.ts";
import { parseSrcset, pickImageSrc } from "../src/lib/image-url.ts";
import { buildBookmarklet, parseCapturePayload } from "../src/lib/bookmarklet.ts";

const CDN =
  "https://substackcdn.com/image/fetch/$s_!AbCd!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc_1500x992.png";
const CDN_424 = CDN.replace("w_1456", "w_424");

const para = (n) =>
  `<p>Paragraph ${n} talks at some length about the subject so the extractor sees real prose, with enough words to count as an article body for the reader.</p>`;

function substackPage({ paywall = false } = {}) {
  return `<!doctype html><html><head>
<title>Test Post - by Jane Writer</title>
<meta property="og:title" content="Test Post">
<meta property="og:site_name" content="Jane's Letter">
<meta property="og:image" content="${CDN}">
<script type="application/ld+json">{"@type":"NewsArticle","headline":"Test Post","datePublished":"2025-04-04T10:17:22+00:00","author":[{"@type":"Person","name":"Jane Writer"}]}</script>
</head><body>
<div class="post-header"><h1 class="post-title published">Test Post</h1><h3 class="subtitle">A subtitle worth reading.</h3></div>
<div class="available-content"><div dir="auto" class="body markup">
${para(1)}
<div class="captioned-image-container"><figure><a class="image-link image2 is-viewable-img" href="${CDN}"><div class="image2-inset"><picture><source type="image/webp" srcset="${CDN_424} 424w, ${CDN} 1456w"><img src="${CDN}" srcset="${CDN_424} 424w, ${CDN} 1456w" alt=""></picture><div class="image-link-expand"><button>Expand</button></div></div></a><figcaption>A caption.</figcaption></figure></div>
<p class="button-wrapper" data-component-name="ButtonCreateButton"><a class="button primary" href="https://jane.substack.com/subscribe"><span>Subscribe now</span></a></p>
${para(2)}<p>A claim that needs a source.<a class="footnote-anchor" data-component-name="FootnoteAnchorToDOM" id="footnote-anchor-1" href="#footnote-1">1</a></p>
<div class="subscription-widget-wrap"><div class="subscription-widget show-subscribe"><p>Thanks for reading! Subscribe for free.</p><form><input type="email"></form></div></div>
<div class="youtube-wrap" data-attrs="{&quot;videoId&quot;:&quot;dQw4w9WgXcQ&quot;}"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"></iframe></div>
${para(3)}${para(4)}
<div class="footnote" data-component-name="FootnoteToDOM"><a class="footnote-number" id="footnote-1" href="#footnote-anchor-1">1</a><div class="footnote-content"><p>The source.</p></div></div>
</div></div>
${paywall ? '<div class="paywall"><h2 class="paywall-title">Keep reading with a 7-day free trial</h2></div>' : ""}
<div class="post-ufi"><button>Share</button></div>
</body></html>`;
}

describe("srcset parsing", () => {
  it("keeps commas inside CDN URLs", () => {
    assert.deepEqual(parseSrcset(`${CDN_424} 424w, ${CDN} 1456w`), [
      { url: CDN_424, descriptor: "424w" },
      { url: CDN, descriptor: "1456w" },
    ]);
  });

  it("does not split a plain src on commas", () => {
    const { document } = parseHTML(`<img src="${CDN}">`);
    assert.equal(pickImageSrc(document.querySelector("img"), "https://jane.substack.com/p/x"), CDN);
  });
});

describe("Substack extraction", () => {
  const article = articleFromCapturedPage({
    url: "https://jane.substack.com/p/test-post",
    title: "Test Post - by Jane Writer",
    html: substackPage(),
  });

  it("reads metadata from the post header and JSON-LD", () => {
    assert.equal(article.title, "Test Post");
    assert.equal(article.author, "Jane Writer");
    assert.equal(article.siteName, "Jane's Letter");
    assert.equal(article.excerpt, "A subtitle worth reading.");
    assert.ok(article.published?.startsWith("2025-04-04"));
  });

  it("drops subscribe widgets, buttons and image toolbars", () => {
    for (const junk of [
      "Subscribe now",
      "Thanks for reading",
      "Expand",
      "Share",
      "<form",
      "<input",
    ]) {
      assert.ok(!article.contentHtml.includes(junk), `should not include ${junk}`);
    }
  });

  it("keeps images with their full CDN URL and caption", () => {
    assert.match(
      article.contentHtml,
      new RegExp(`<img src="${CDN.replace(/[$!.?*+^()[\]{}|\\]/g, "\\$&")}"`),
    );
    assert.match(article.contentHtml, /<figcaption>A caption\.<\/figcaption>/);
    assert.ok(
      !/<a [^>]*>\s*<div>\s*<img/.test(article.contentHtml),
      "image should not be wrapped in a link",
    );
  });

  it("renders footnotes as superscripts and embeds as links", () => {
    assert.match(article.contentHtml, /source\.<sup>1<\/sup><\/p>/);
    assert.match(article.contentHtml, /<p><sup>1<\/sup> The source\.<\/p>/);
    assert.match(article.contentHtml, /href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"/);
  });

  it("notes when the rest of a post is paywalled", () => {
    const paywalled = articleFromCapturedPage({
      url: "https://jane.substack.com/p/test-post",
      title: "Test Post",
      html: substackPage({ paywall: true }),
    });
    assert.match(paywalled.contentHtml, /continues for paid subscribers/);
    assert.ok(!article.contentHtml.includes("paid subscribers"));
  });

  it("detects Substack on a custom domain", () => {
    const custom = articleFromCapturedPage({
      url: "https://writing.janewriter.com/p/test-post",
      title: "Test Post",
      html: substackPage(),
    });
    assert.ok(!custom.contentHtml.includes("Subscribe now"));
    assert.equal(custom.excerpt, "A subtitle worth reading.");
  });
});

describe("capture payloads", () => {
  it("validates shape and caps sizes", () => {
    assert.equal(parseCapturePayload(null), null);
    assert.equal(parseCapturePayload({ title: "t", html: "   " }), null);
    const p = parseCapturePayload({ title: "t", url: 5, html: "<p>x</p>" });
    assert.deepEqual(p, { title: "t", url: "", html: "<p>x</p>" });
  });

  it("builds a bookmarklet that parses and never puts the page in a URL", () => {
    const bm = buildBookmarklet("https://kami.example.com/");
    assert.ok(bm.startsWith("javascript:"));
    const src = bm.slice("javascript:".length);
    assert.doesNotThrow(() => new Function(src));
    assert.ok(src.includes('"https://kami.example.com"+"/capture?via=bookmarklet"'));
    assert.ok(!src.includes("?import="));
    assert.ok(!src.includes("%"), "javascript: URLs are percent-decoded by browsers");
  });
});
