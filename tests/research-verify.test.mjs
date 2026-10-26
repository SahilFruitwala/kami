import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanQuote, normalizeForMatch, verifyQuote } from "../src/lib/research/verify.ts";

const page = [
  "## Editing is killing me",
  "",
  "I spend **four hours** editing every single episode and it is driving me mad.",
  "",
  "> Someone said: “Descript keeps crashing on long recordings, so I switched to Audacity.”",
  "",
  "- It’s the  filler   words — um, uh — that take the longest to cut out.",
].join("\n");

describe("verifyQuote", () => {
  it("finds a quote whatever the emphasis, curly quotes, dashes, spacing and case", () => {
    assert.deepEqual(
      verifyQuote(
        "I spend four hours editing every single episode and it is driving me mad.",
        page,
      ),
      {
        match: "exact",
        quote: "I spend four hours editing every single episode and it is driving me mad.",
      },
    );
    assert.equal(
      verifyQuote(`Descript keeps crashing on long recordings, so I switched to Audacity.`, page)
        ?.match,
      "exact",
    );
    assert.equal(
      verifyQuote("it's the filler words - um, uh - that take the LONGEST to cut out", page)?.match,
      "exact",
    );
  });

  it("accepts a near-identical quote, stored in the page's own words", () => {
    const close = verifyQuote(
      "I spend four hours editing every single episode and it is driving me crazy.",
      page,
    );
    assert.equal(close?.match, "close");
    assert.equal(
      close?.quote,
      "I spend four hours editing every single episode and it is driving me mad.",
    );
  });

  it("drops quotes that aren't on the page", () => {
    assert.equal(verifyQuote("Nobody here would ever pay for an editing tool, ever.", page), null);
    // Half the words changed is a paraphrase, not a quote.
    assert.equal(
      verifyQuote("I waste so many hours cutting each show and it makes me angry.", page),
      null,
    );
  });

  it("drops quotes that are too short or too long", () => {
    assert.equal(verifyQuote("driving me mad", page), null);
    assert.equal(verifyQuote(`${"word ".repeat(150)}`, `${"word ".repeat(200)}`), null);
  });

  it("needs a few words for a close match, so chance overlaps don't pass", () => {
    assert.equal(verifyQuote("editing every single episodes ok", page), null);
  });
});

describe("normalizeForMatch and cleanQuote", () => {
  it("reduce text to what it says", () => {
    assert.equal(normalizeForMatch("> “Hi”  — **there**\n\n# Title"), '"hi" - there title');
    assert.equal(cleanQuote("  so **very**   _slow_ "), "so very slow");
  });
});
