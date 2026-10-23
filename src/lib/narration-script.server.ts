import { parseHTML } from "linkedom";

/**
 * The narration script: an article's saved HTML turned into the text a voice
 * reads aloud, split into Narration parts small enough for one Deepgram call.
 * Aura-2 takes no SSML or pause tags, so structure is carried by punctuation:
 * headings are preceded by "..." for a longer pause. Tested in
 * scripts/narration-script.test.mjs.
 */

/** Deepgram's hard limit on text per TTS request. */
export const MAX_PART_CHARS = 2000;
/** The longest script we will narrate (~20k words, ~2 hours of audio). */
export const MAX_SCRIPT_CHARS = 120_000;

export const CODE_SKIPPED = "Code sample skipped.";
export const TABLE_SKIPPED = "Table skipped.";

export type NarrationScriptInput = {
  title: string;
  author: string;
  siteName: string;
  html: string;
};

export type NarrationScript = {
  /** Text for each Deepgram call, in order; never empty, never over MAX_PART_CHARS. */
  parts: string[];
  /** Total characters across parts: what Deepgram bills. */
  chars: number;
  /** Whether the text reads as English (the only language the voice speaks). */
  english: boolean;
};

const FOOTNOTE_HEADING = /^(foot\s?notes?|end\s?notes?|notes|references)$/i;
const FOOTNOTE_HREF = /#(fn|footnote|note|endnote|cite|ref)/i;
const FOOTNOTE_MARKER = /^\s*[[(]?\s*(\d{1,3}|[a-z]|[*†‡§]+)\s*[\])]?\s*$/i;
const BACKLINK = /[↩↑⤴]/;
const SUPERSCRIPT_DIGITS = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g;
const URL_TOKEN = /\b(?:https?:\/\/|www\.)\S+/gi;
const BLOCK_TAGS = /^(P|LI|BLOCKQUOTE|H[1-6]|FIGCAPTION|DIV|FIGURE|UL|OL|PRE|TABLE|HR|IMG)$/;

/** Collapse whitespace, drop URLs and stray superscript digits. */
function clean(text: string): string {
  return text
    .replace(URL_TOKEN, " ")
    .replace(SUPERSCRIPT_DIGITS, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/** End a spoken line with punctuation so the voice pauses after it. */
function closeSentence(text: string): string {
  return /[.!?…:;"”'’)]$/.test(text) ? text : `${text}.`;
}

function isFootnoteRef(el: Element): boolean {
  if (el.tagName !== "SUP") return false;
  const link = el.querySelector("a");
  if (link && FOOTNOTE_HREF.test(link.getAttribute("href") ?? "")) return true;
  return FOOTNOTE_MARKER.test(el.textContent ?? "");
}

function isFootnoteList(el: Element): boolean {
  if (el.tagName !== "OL" && el.tagName !== "UL") return false;
  const items = [...el.children].filter((c) => c.tagName === "LI");
  if (!items.length) return false;
  const backlinked = items.filter((li) =>
    [...li.querySelectorAll("a")].some(
      (a) =>
        BACKLINK.test(a.textContent ?? "") || /#fnref|#ref/i.test(a.getAttribute("href") ?? ""),
    ),
  );
  return backlinked.length >= Math.ceil(items.length / 2);
}

/** Inline text of an element, without footnote markers or images. */
function inlineText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  if (el.tagName === "IMG" || isFootnoteRef(el)) return "";
  if (el.tagName === "BR") return " ";
  return [...el.childNodes].map(inlineText).join("");
}

/** Walk the body into spoken lines (one per paragraph-like block). */
function spokenLines(root: Element): string[] {
  const lines: string[] = [];
  let stopped = false;

  const push = (text: string, heading = false) => {
    const line = clean(text);
    if (!line) return;
    lines.push(heading ? `... ${closeSentence(line)}` : closeSentence(line));
  };

  const walk = (el: Element) => {
    // Loose text and inline elements between blocks read as one line.
    let inline = "";
    const flush = () => {
      push(inline);
      inline = "";
    };
    for (const node of [...el.childNodes]) {
      if (stopped) return;
      if (node.nodeType === 3) {
        inline += node.textContent ?? "";
        continue;
      }
      if (node.nodeType !== 1) continue;
      const child = node as Element;
      const tag = child.tagName;
      if (!BLOCK_TAGS.test(tag)) {
        inline += tag === "BR" ? " " : inlineText(child);
        continue;
      }
      flush();
      if (/^H[1-6]$/.test(tag)) {
        const text = clean(inlineText(child));
        if (FOOTNOTE_HEADING.test(text.replace(/[.:]$/, ""))) {
          stopped = true;
          return;
        }
        push(text, true);
      } else if (tag === "PRE") {
        lines.push(CODE_SKIPPED);
      } else if (tag === "TABLE") {
        lines.push(TABLE_SKIPPED);
      } else if (tag === "IMG" || tag === "HR") {
        continue;
      } else if (tag === "FIGURE") {
        const caption = child.querySelector("figcaption");
        if (child.querySelector("pre")) lines.push(CODE_SKIPPED);
        else if (child.querySelector("table")) lines.push(TABLE_SKIPPED);
        if (caption) push(inlineText(caption));
      } else if (tag === "UL" || tag === "OL") {
        if (isFootnoteList(child)) continue;
        walk(child);
      } else if (tag === "LI" || tag === "BLOCKQUOTE" || tag === "DIV") {
        // Containers may hold nested blocks; plain ones are a single line.
        const hasBlocks = [...child.children].some((c) => BLOCK_TAGS.test(c.tagName));
        if (hasBlocks) walk(child);
        else push(inlineText(child));
      } else {
        push(inlineText(child));
      }
    }
    if (!stopped) flush();
  };

  walk(root);
  return lines;
}

function intro({ title, author, siteName }: NarrationScriptInput): string {
  const head = closeSentence(clean(title) || "Untitled");
  const by = clean(author);
  const site = clean(siteName);
  if (by && site) return `${head} By ${by}, ${site}.`;
  if (by) return `${head} By ${by}.`;
  if (site) return `${head} From ${site}.`;
  return head;
}

/** Split text into sentences, keeping their closing punctuation. */
function sentences(line: string): string[] {
  return line.split(/(?<=[.!?…]["”'’)]?)\s+/).filter(Boolean);
}

/** Break one over-long sentence at clauses, then words, then hard cuts. */
function breakLong(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence];
  const out: string[] = [];
  let current = "";
  const pieces = sentence.split(/(?<=[,;:—])\s+|\s+/);
  for (const piece of pieces) {
    if (piece.length > max) {
      if (current) out.push(current);
      current = "";
      for (let i = 0; i < piece.length; i += max) out.push(piece.slice(i, i + max));
      continue;
    }
    const next = current ? `${current} ${piece}` : piece;
    if (next.length > max) {
      out.push(current);
      current = piece;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}

/** Pack lines into parts of at most `max` characters, breaking between sentences. */
export function packParts(lines: string[], max = MAX_PART_CHARS): string[] {
  const parts: string[] = [];
  let current = "";
  for (const line of lines) {
    for (const sentence of sentences(line)) {
      for (const chunk of breakLong(sentence, max)) {
        const sep = current ? (current.endsWith("\n") ? "" : " ") : "";
        const next = current + sep + chunk;
        if (next.length > max) {
          parts.push(current.trim());
          current = chunk;
        } else {
          current = next;
        }
      }
    }
    if (current) current += "\n";
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

const ENGLISH_WORDS = new Set(
  (
    "the and of to in is that it for was with as on be at by this have from or are not but " +
    "they you we his her their which an were has been would will can there what about when " +
    "more if so one all she he its our my your who how than then them these those"
  ).split(" "),
);

/**
 * Does this read as English? Mostly Latin script, and common English function
 * words make up a fair share of the words. No dependency, and good enough to
 * keep a French or Hindi piece from being read in an English voice.
 */
export function looksEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (!letters) return false;
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
  if (latin / letters < 0.9) return false;
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 20) return true;
  const common = words.filter((w) => ENGLISH_WORDS.has(w)).length;
  return common / words.length >= 0.12;
}

/** Article HTML → the narration script. */
export function buildNarrationScript(input: NarrationScriptInput): NarrationScript {
  const { document } = parseHTML(`<div id="root">${input.html}</div>`);
  const root = document.getElementById("root") as Element | null;
  const body = root ? spokenLines(root) : [];
  const parts = packParts([intro(input), ...body]);
  return {
    parts,
    chars: parts.reduce((sum, p) => sum + p.length, 0),
    english: looksEnglish(body.join(" ")),
  };
}
