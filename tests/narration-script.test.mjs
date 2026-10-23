import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CODE_SKIPPED,
  MAX_PART_CHARS,
  TABLE_SKIPPED,
  buildNarrationScript,
  looksEnglish,
  packParts,
} from "../src/lib/narration-script.server.ts";

const ENGLISH =
  "The city council met on Tuesday to discuss the budget. It was a long meeting, and most of the " +
  "people who came were there to talk about the new library. They said that it would be good for " +
  "the town, but the cost was a worry for some of them.";

const script = (html, meta = {}) =>
  buildNarrationScript({ title: "A Title", author: "", siteName: "", html, ...meta });
// Paragraphs are separated by newlines inside a part; compare as plain prose.
const text = (html, meta) => script(html, meta).parts.join(" ").replace(/\s+/g, " ");

describe("buildNarrationScript: intro", () => {
  it("opens with title, author and site", () => {
    const s = text("<p>Body.</p>", { author: "Ada Lovelace", siteName: "The Notes" });
    assert.ok(s.startsWith("A Title. By Ada Lovelace, The Notes."));
  });

  it("handles a missing author or site", () => {
    assert.ok(text("<p>Body.</p>", { author: "Ada" }).startsWith("A Title. By Ada."));
    assert.ok(text("<p>Body.</p>", { siteName: "Site" }).startsWith("A Title. From Site."));
    assert.ok(text("<p>Body.</p>").startsWith("A Title. Body."));
  });

  it("keeps a title's own punctuation", () => {
    assert.ok(text("<p>x</p>", { title: "Why now?" }).startsWith("Why now? x."));
  });
});

describe("buildNarrationScript: element rules", () => {
  it("precedes headings with a pause and closes them as sentences", () => {
    assert.match(
      text("<p>Intro.</p><h2>The Turn</h2><p>Then.</p>"),
      /Intro\. \.\.\. The Turn\. Then\./,
    );
  });

  it("reads list items as separate sentences", () => {
    assert.match(text("<ul><li>apples</li><li>pears</li></ul>"), /apples\. pears\./);
  });

  it("reads quotes", () => {
    assert.match(text("<blockquote><p>To be.</p></blockquote>"), /To be\./);
  });

  it("reads link text, never URLs", () => {
    const s = text(
      '<p>See <a href="https://example.com/x">the report</a> or https://example.com/y now.</p>',
    );
    assert.match(s, /See the report or now\./);
    assert.doesNotMatch(s, /example\.com/);
  });

  it("skips images and alt text but reads captions", () => {
    const s = text(
      '<figure><img src="a.png" alt="ALT TEXT"><figcaption>A harbour at dawn</figcaption></figure>',
    );
    assert.match(s, /A harbour at dawn\./);
    assert.doesNotMatch(s, /ALT TEXT/);
    assert.doesNotMatch(text('<p>Before <img src="a.png" alt="ALT"> after.</p>'), /ALT/);
  });

  it("replaces code blocks", () => {
    const s = text("<p>Run this:</p><pre><code>const x = 1;</code></pre><p>Done.</p>");
    assert.ok(s.includes(CODE_SKIPPED));
    assert.doesNotMatch(s, /const x/);
  });

  it("keeps inline code as words", () => {
    assert.match(text("<p>Call <code>render</code> twice.</p>"), /Call render twice\./);
  });

  it("replaces tables", () => {
    const s = text("<table><tr><td>Cell A</td><td>Cell B</td></tr></table>");
    assert.ok(s.includes(TABLE_SKIPPED));
    assert.doesNotMatch(s, /Cell A/);
  });

  it("drops footnote markers", () => {
    assert.match(
      text('<p>A claim<sup><a href="https://x.com/p#fn1">1</a></sup> stands.</p>'),
      /A claim stands\./,
    );
    assert.match(text("<p>A claim<sup>[2]</sup> stands.</p>"), /A claim stands\./);
    assert.match(text("<p>A claim¹ stands.</p>"), /A claim stands\./);
  });

  it("keeps a real superscript word", () => {
    assert.match(text("<p>Rank<sup>th</sup> nothing.</p>"), /Rank/);
  });

  it("skips a footnote section under a Notes heading", () => {
    const s = text("<p>Body.</p><h2>Footnotes</h2><ol><li>Source one.</li></ol>");
    assert.doesNotMatch(s, /Footnotes|Source one/);
  });

  it("skips a back-linked footnote list", () => {
    const html =
      '<p>Body.</p><ol><li>First note <a href="https://x.com/p#fnref1">↩</a></li>' +
      '<li>Second note <a href="https://x.com/p#fnref2">↩</a></li></ol>';
    assert.doesNotMatch(text(html), /First note/);
  });

  it("keeps inline formatting in one sentence", () => {
    assert.match(
      text("Loose <em>emphasis</em> and <strong>bold</strong> text"),
      /Loose emphasis and bold text\./,
    );
  });

  it("decodes entities", () => {
    assert.match(text("<p>Fish &amp; chips &mdash; cheap.</p>"), /Fish & chips — cheap\./);
  });
});

describe("buildNarrationScript: parts", () => {
  it("never makes a part over the limit or an empty part", () => {
    const html = Array.from({ length: 80 }, (_, i) => `<p>${ENGLISH} Paragraph ${i}.</p>`).join("");
    const { parts, chars } = script(html);
    assert.ok(parts.length > 1);
    for (const p of parts) {
      assert.ok(p.length > 0 && p.length <= MAX_PART_CHARS, `part of ${p.length}`);
    }
    assert.equal(
      chars,
      parts.reduce((n, p) => n + p.length, 0),
    );
  });

  it("breaks between sentences", () => {
    const parts = packParts(["One two. Three four. Five six."], 20);
    assert.deepEqual(parts, ["One two. Three four.", "Five six."]);
  });

  it("splits a giant sentence at clauses, then words, then hard cuts", () => {
    const giant = `${"word, ".repeat(600)}end.`;
    const parts = packParts([giant]);
    assert.ok(parts.every((p) => p.length <= MAX_PART_CHARS));
    const unbroken = "x".repeat(4500);
    const cut = packParts([unbroken]);
    assert.deepEqual(
      cut.map((p) => p.length),
      [2000, 2000, 500],
    );
  });
});

describe("looksEnglish", () => {
  it("accepts English", () => {
    assert.equal(looksEnglish(ENGLISH), true);
    assert.equal(script(`<p>${ENGLISH}</p>`).english, true);
  });

  it("rejects French", () => {
    const fr =
      "Le conseil municipal s'est réuni mardi pour discuter du budget. La réunion a été longue, " +
      "et la plupart des personnes présentes voulaient parler de la nouvelle bibliothèque. Elles " +
      "ont dit que ce serait bon pour la ville, mais le coût inquiétait certains d'entre eux.";
    assert.equal(looksEnglish(fr), false);
  });

  it("rejects Hindi and Japanese", () => {
    assert.equal(
      looksEnglish("नगर परिषद ने बजट पर चर्चा करने के लिए मंगलवार को बैठक की। यह एक लंबी बैठक थी।"),
      false,
    );
    assert.equal(
      looksEnglish("市議会は火曜日に予算について話し合うために会合を開いた。長い会議だった。"),
      false,
    );
  });
});
