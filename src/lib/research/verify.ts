/**
 * Checking a model's quote against the page it says it came from, in code.
 * Evidence is only ever stored when the quote is really on the page; this is
 * what keeps a made-up quote out of every idea and report. Tested in
 * tests/research-verify.test.mjs.
 *
 *   exact: after normalising both sides (Unicode, quotes and dashes, Markdown
 *          emphasis, whitespace, case) the quote is a substring of the page.
 *   close: otherwise, some run of the page's words the same length as the
 *          quote shares at least CLOSE_MATCH of its words. The page's own
 *          wording is stored, never the model's.
 *   else:  dropped.
 */

/** Share of a quote's words a window of the page must hold to count as close _(start value)_. */
export const CLOSE_MATCH = 0.9;
/** Quotes shorter than this say too little; longer ones aren't one point. */
export const MIN_QUOTE_CHARS = 20;
export const MAX_QUOTE_CHARS = 600;
/** A close match needs at least this many words, or chance overlaps would pass. */
const MIN_CLOSE_WORDS = 6;

export type VerifiedQuote = { match: "exact" | "close"; quote: string };

/** Markdown emphasis and code marks, which change how text looks, not what it says. */
const EMPHASIS = /[*_`~]+/g;

/** Readable form of a quote: emphasis gone, whitespace collapsed. */
export function cleanQuote(text: string): string {
  return text.replace(EMPHASIS, "").replace(/\s+/g, " ").trim();
}

/** The comparable form of text: what both sides are reduced to before matching. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/…/g, "...")
    .replace(EMPHASIS, "")
    .replace(/^\s*(?:#{1,6}|>+|[-+]|\d+\.)\s+/gm, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** A word reduced for comparison: normalised, without surrounding punctuation. */
function wordKey(word: string): string {
  return normalizeForMatch(word).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

type Word = { text: string; key: string };

function words(text: string): Word[] {
  return text
    .replace(EMPHASIS, "")
    .split(/\s+/)
    .map((w) => ({ text: w, key: wordKey(w) }))
    .filter((w) => w.key);
}

/**
 * The best run of `page` words, `size` long, by how many of `quote`'s words
 * it holds (counted with repeats). Sliding counts keep it linear in the page.
 */
function bestWindow(page: Word[], quoteKeys: string[]): { start: number; shared: number } {
  const size = quoteKeys.length;
  const want = new Map<string, number>();
  for (const k of quoteKeys) want.set(k, (want.get(k) ?? 0) + 1);
  const have = new Map<string, number>();
  let shared = 0;
  const add = (k: string) => {
    const n = (have.get(k) ?? 0) + 1;
    have.set(k, n);
    if (n <= (want.get(k) ?? 0)) shared++;
  };
  const remove = (k: string) => {
    const n = have.get(k) ?? 0;
    have.set(k, n - 1);
    if (n <= (want.get(k) ?? 0)) shared--;
  };
  // Among windows sharing as many words, prefer one that starts and ends
  // where the quote does, so the stored text isn't shifted a word or two.
  const first = quoteKeys[0];
  const last = quoteKeys[size - 1];
  let best = { start: 0, shared: -1, aligned: -1 };
  for (let i = 0; i < page.length; i++) {
    add(page[i].key);
    if (i >= size) remove(page[i - size].key);
    if (i < size - 1) continue;
    const start = i - size + 1;
    const aligned = Number(page[start].key === first) + Number(page[i].key === last);
    if (shared > best.shared || (shared === best.shared && aligned > best.aligned)) {
      best = { start, shared, aligned };
    }
  }
  return best;
}

/** Check one quote against its page; null when it isn't there (or is too short or long). */
export function verifyQuote(quote: string, page: string): VerifiedQuote | null {
  const clean = cleanQuote(quote);
  if (clean.length < MIN_QUOTE_CHARS || clean.length > MAX_QUOTE_CHARS) return null;
  const needle = normalizeForMatch(clean);
  if (needle && normalizeForMatch(page).includes(needle)) return { match: "exact", quote: clean };

  const quoteKeys = words(clean).map((w) => w.key);
  if (quoteKeys.length < MIN_CLOSE_WORDS) return null;
  const pageWords = words(page);
  if (pageWords.length < quoteKeys.length) return null;
  const { start, shared } = bestWindow(pageWords, quoteKeys);
  if (shared / quoteKeys.length < CLOSE_MATCH) return null;
  const own = pageWords
    .slice(start, start + quoteKeys.length)
    .map((w) => w.text)
    .join(" ");
  const ownClean = cleanQuote(own);
  return ownClean.length > MAX_QUOTE_CHARS ? null : { match: "close", quote: ownClean };
}
