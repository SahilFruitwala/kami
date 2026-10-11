/**
 * Text shaping for the AI features: splitting saved text into chunks for
 * semantic search and turning highlights into prompt-ready lines. Pure, so
 * it is unit-tested (scripts/ai.test.mjs).
 */

/** Split text into chunks of at most `maxChars`, breaking between sentences where possible. */
export function chunkText(text: string, maxChars: number, maxChunks: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?…])\s+/);
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if (chunks.length >= maxChunks) break;
    // A single very long "sentence" (no punctuation) is cut hard.
    for (let start = 0; start < sentence.length; start += maxChars) {
      const piece = sentence.slice(start, start + maxChars);
      if (current && current.length + 1 + piece.length > maxChars) push();
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (chunks.length < maxChunks) push();
  return chunks.slice(0, maxChunks);
}

export type HighlightLike = { text: string; note?: string };

/** One highlight as a quoted line, with the reader's note when there is one. */
export function highlightLine(h: HighlightLike): string {
  const quote = `“${h.text.replace(/\s+/g, " ").trim()}”`;
  const note = h.note?.replace(/\s+/g, " ").trim();
  return note ? `${quote} — note: ${note}` : quote;
}

/** Group highlight lines into chunks of at most `maxChars` each. */
export function highlightChunks(
  highlights: HighlightLike[],
  maxChars: number,
  maxChunks: number,
): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const h of highlights) {
    const line = highlightLine(h).slice(0, maxChars);
    if (current && current.length + 1 + line.length > maxChars) {
      chunks.push(current);
      current = "";
      if (chunks.length >= maxChunks) return chunks;
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current && chunks.length < maxChunks) chunks.push(current);
  return chunks;
}

/** Postgres pgvector literal for an embedding. */
export function vectorLiteral(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? Number(v.toFixed(7)) : 0)).join(",")}]`;
}
