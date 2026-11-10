import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withArticleToc } from "@/lib/article-toc.ts";

describe("withArticleToc", () => {
  it("stays quiet when there are not enough headings", () => {
    const html = "<p>Hello</p><h2>Only one</h2><p>More</p>";
    const result = withArticleToc(html);
    assert.deepEqual(result.entries, []);
    assert.equal(result.html, html);
  });

  it("builds a table of contents from h2 and h3", () => {
    const html = `
      <h2>Why this fails</h2>
      <p>One</p>
      <h3>Immediate mode</h3>
      <p>Two</p>
      <h2>What to use instead</h2>
    `;
    const result = withArticleToc(html);
    assert.equal(result.entries.length, 3);
    assert.equal(result.entries[0].text, "Why this fails");
    assert.equal(result.entries[0].level, 2);
    assert.equal(result.entries[0].id, "sec-why-this-fails");
    assert.equal(result.entries[1].text, "Immediate mode");
    assert.equal(result.entries[1].level, 3);
    assert.match(result.html, /<h2 id="sec-why-this-fails">Why this fails<\/h2>/);
    assert.match(result.html, /<h3 id="sec-immediate-mode">Immediate mode<\/h3>/);
  });

  it("skips empty headings and uniquifies slugs", () => {
    const html = `<h2>Notes</h2><h2>  </h2><h2>Notes</h2><h3><strong>Notes</strong></h3>`;
    const result = withArticleToc(html);
    assert.deepEqual(
      result.entries.map((e) => e.id),
      ["sec-notes", "sec-notes-2", "sec-notes-3"],
    );
  });

  it("decodes entities and strips markup in the label", () => {
    const html = `<h2>Foo &amp; bar</h2><h2>A <em>nested</em> title</h2>`;
    const result = withArticleToc(html);
    assert.equal(result.entries[0].text, "Foo & bar");
    assert.equal(result.entries[1].text, "A nested title");
    assert.equal(result.entries[1].id, "sec-a-nested-title");
  });

  it("keeps an existing heading id", () => {
    const html = `<h2 id="already">First</h2><h2>Second</h2>`;
    const result = withArticleToc(html);
    assert.equal(result.entries[0].id, "already");
    assert.match(result.html, /<h2 id="already">First<\/h2>/);
  });
});
