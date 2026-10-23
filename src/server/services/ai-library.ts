import "@tanstack/react-start/server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { AiStatus, IndexProgress, LibraryHit, LibrarySource } from "@/lib/api/ai";
import { textFromHtml } from "@/lib/article-build.server.ts";
import { chunkText, highlightChunks, vectorLiteral, type HighlightLike } from "@/lib/ai-text.ts";
import { getDb } from "@/lib/db";
import { aiConfigured, aiEmbeddingModels } from "@/lib/llm.server.ts";
import { clipText } from "@/lib/model-fallback.ts";
import { narrationConfigured } from "@/lib/narration-config.server.ts";
import { uid } from "@/lib/store";
import { asDocument, chatHistory, embedTexts, streamChat, type chatTurnInput } from "@/server/ai";

/**
 * "Ask your library": semantic search over saved articles and their
 * highlights and notes (pgvector, migration 0017), and a chat that answers from the best
 * matches with numbered citations. Without pgvector or an embedding model,
 * both fall back to Postgres full-text search.
 *
 * Indexing is incremental and pulled by the browser: each `indexLibrary`
 * call embeds a small batch of new or changed docs and reports what is left.
 */

const CHUNK_CHARS = 1500;
const MAX_ARTICLE_CHUNKS = 8;
const MAX_HIGHLIGHT_CHUNKS = 6;
/** Docs and chunks embedded per `indexLibrary` call (one embedding request). */
const BATCH_DOCS = 12;
const BATCH_CHUNKS = 96;

type Kind = "article" | "highlights";
type Doc = { kind: Kind; refId: string; hash: string; chunks: string[] };

export const searchQuery = z.object({
  q: z.string().trim().min(2, "Type a few words to search.").max(500),
});

// ---------- Readiness ----------

let tableChecked: { at: number; ok: boolean } | null = null;

/** True when pgvector's table exists (re-checked every 10 minutes). */
async function embeddingsTable(): Promise<boolean> {
  if (tableChecked && Date.now() - tableChecked.at < 600_000) return tableChecked.ok;
  const db = await getDb();
  const result = await db.execute<{ ok: boolean }>(
    sql`select to_regclass('public.ai_embeddings') is not null as ok`,
  );
  tableChecked = { at: Date.now(), ok: Boolean(result.rows[0]?.ok) };
  return tableChecked.ok;
}

/** Semantic search needs both pgvector and an embedding provider key. */
export async function semanticReady(): Promise<boolean> {
  return aiEmbeddingModels().length > 0 && (await embeddingsTable());
}

export async function getAiStatus(): Promise<AiStatus> {
  const enabled = aiConfigured();
  return {
    enabled,
    semanticSearch: enabled && (await semanticReady()),
    narration: narrationConfigured(),
  };
}

// ---------- Indexing ----------

const STUB = "%Saved as a link.%";

function pendingArticles(userId: string, limit: number) {
  return sql`
    select a.id, a.title, a.content_html as html, md5(a.content_html) as hash
    from articles a
    where a.user_id = ${userId}
      and length(a.content_html) > 200 and a.content_html not like ${STUB}
      and not exists (
        select 1 from ai_embeddings e
        where e.user_id = a.user_id and e.kind = 'article' and e.ref_id = a.id
          and e.chunk = 0 and e.content_hash = md5(a.content_html)
      )
    order by a.saved_at desc
    limit ${limit}`;
}

function pendingHighlights(userId: string, limit: number) {
  return sql`
    select a.id, a.title, a.highlights, md5(a.highlights::text) as hash
    from articles a
    where a.user_id = ${userId} and jsonb_array_length(a.highlights) > 0
      and not exists (
        select 1 from ai_embeddings e
        where e.user_id = a.user_id and e.kind = 'highlights' and e.ref_id = a.id
          and e.chunk = 0 and e.content_hash = md5(a.highlights::text)
      )
    order by a.saved_at desc
    limit ${limit}`;
}

async function countPending(userId: string): Promise<number> {
  const db = await getDb();
  const big = 100_000;
  const result = await db.execute<{ n: number }>(sql`
    select
      (select count(*) from (${pendingArticles(userId, big)}) a)::int +
      (select count(*) from (${pendingHighlights(userId, big)}) h)::int as n`);
  return Number(result.rows[0]?.n ?? 0);
}

/** Drop chunks whose source is gone (deleted article, cleared highlights). */
async function pruneOrphans(userId: string): Promise<void> {
  const db = await getDb();
  await db.execute(sql`
    delete from ai_embeddings e
    where e.user_id = ${userId} and (
      (e.kind = 'article' and not exists (
        select 1 from articles a where a.id = e.ref_id and a.user_id = e.user_id))
      or (e.kind = 'highlights' and not exists (
        select 1 from articles a where a.id = e.ref_id and a.user_id = e.user_id
          and jsonb_array_length(a.highlights) > 0))
    )`);
}

async function nextDocs(userId: string): Promise<Doc[]> {
  const db = await getDb();
  const [articleRows, highlightRows] = await Promise.all([
    db.execute<{ id: string; title: string; html: string; hash: string }>(
      pendingArticles(userId, BATCH_DOCS),
    ),
    db.execute<{ id: string; title: string; highlights: HighlightLike[]; hash: string }>(
      pendingHighlights(userId, BATCH_DOCS),
    ),
  ]);

  const candidates: Doc[] = [
    ...highlightRows.rows.map((r) => ({
      kind: "highlights" as const,
      refId: r.id,
      hash: r.hash,
      chunks: highlightChunks(r.highlights ?? [], CHUNK_CHARS, MAX_HIGHLIGHT_CHUNKS).map(
        (c) => `Highlights from “${r.title}”\n${c}`,
      ),
    })),
    ...articleRows.rows.map((r) => ({
      kind: "article" as const,
      refId: r.id,
      hash: r.hash,
      chunks: chunkText(textFromHtml(r.html), CHUNK_CHARS, MAX_ARTICLE_CHUNKS).map(
        (c) => `${r.title}\n${c}`,
      ),
    })),
  ];

  const docs: Doc[] = [];
  let chunkCount = 0;
  for (const doc of candidates) {
    if (!doc.chunks.length) continue;
    if (docs.length >= BATCH_DOCS || chunkCount + doc.chunks.length > BATCH_CHUNKS) break;
    docs.push(doc);
    chunkCount += doc.chunks.length;
  }
  return docs;
}

/** Embed the next batch of new or changed docs. Call again while `remaining > 0`. */
export async function indexLibrary(userId: string): Promise<IndexProgress> {
  if (!(await semanticReady())) return { enabled: false, indexed: 0, remaining: 0 };
  await pruneOrphans(userId);
  const docs = await nextDocs(userId);
  if (docs.length) {
    const vectors = await embedTexts(docs.flatMap((d) => d.chunks));
    if (!vectors) return { enabled: false, indexed: 0, remaining: 0 };
    const db = await getDb();
    let v = 0;
    await db.transaction(async (tx) => {
      for (const doc of docs) {
        await tx.execute(sql`
          delete from ai_embeddings
          where user_id = ${userId} and kind = ${doc.kind} and ref_id = ${doc.refId}`);
        for (let i = 0; i < doc.chunks.length; i++) {
          await tx.execute(sql`
            insert into ai_embeddings (id, user_id, kind, ref_id, chunk, content, content_hash, embedding)
            values (${uid()}, ${userId}, ${doc.kind}, ${doc.refId}, ${i}, ${doc.chunks[i]},
              ${doc.hash}, ${vectorLiteral(vectors[v++])}::vector)`);
        }
      }
    });
  }
  return { enabled: true, indexed: docs.length, remaining: await countPending(userId) };
}

// ---------- Retrieval ----------

type Chunk = { kind: Kind; refId: string; content: string; score: number };

async function semanticChunks(userId: string, q: string, limit: number): Promise<Chunk[]> {
  const vectors = await embedTexts([q]);
  if (!vectors?.[0]) return [];
  const vec = vectorLiteral(vectors[0]);
  const db = await getDb();
  const result = await db.execute<{ kind: Kind; ref_id: string; content: string; score: number }>(
    sql`
      select kind, ref_id, content, 1 - (embedding <=> ${vec}::vector) as score
      from ai_embeddings
      where user_id = ${userId}
      order by embedding <=> ${vec}::vector
      limit ${limit}`,
  );
  return result.rows.map((r) => ({
    kind: r.kind,
    refId: r.ref_id,
    content: r.content,
    score: Number(r.score),
  }));
}

/** Full-text fallback: whole articles, best first. */
async function keywordChunks(userId: string, q: string, limit: number): Promise<Chunk[]> {
  const db = await getDb();
  const result = await db.execute<{ kind: Kind; ref_id: string; content: string; score: number }>(
    sql`
      with query as (select websearch_to_tsquery('simple', ${q}) as tsq),
      docs as (
        select a.id, a.title, regexp_replace(a.content_html, '<[^>]+>', ' ', 'g') as body
        from articles a where a.user_id = ${userId}
      )
      select * from (
        select 'article' as kind, d.id as ref_id, d.title || E'\n' || left(d.body, 6000) as content,
          ts_rank(setweight(to_tsvector('simple', d.title), 'A') || to_tsvector('simple', d.body), query.tsq) as score
        from docs d, query
        where (setweight(to_tsvector('simple', d.title), 'A') || to_tsvector('simple', d.body)) @@ query.tsq
      ) hits
      order by score desc
      limit ${limit}`,
  );
  return result.rows.map((r) => ({
    kind: r.kind,
    refId: r.ref_id,
    content: r.content.replace(/\s+/g, " "),
    score: Number(r.score),
  }));
}

async function retrieve(userId: string, q: string, limit: number) {
  const semantic = await semanticReady();
  const chunks = semantic
    ? await semanticChunks(userId, q, limit)
    : await keywordChunks(userId, q, limit);
  return { semantic, chunks };
}

/** Titles and dates for the docs behind some chunks. */
async function describe(userId: string, chunks: Chunk[]): Promise<Map<string, LibrarySource>> {
  const articleIds = [...new Set(chunks.map((c) => c.refId))];
  const db = await getDb();
  const out = new Map<string, LibrarySource>();
  if (articleIds.length) {
    const rows = await db.execute<{ id: string; title: string; site: string }>(sql`
      select id, title, site_name as site from articles
      where user_id = ${userId} and id in ${articleIds}`);
    for (const r of rows.rows) {
      for (const kind of ["article", "highlights"] as const) {
        out.set(`${kind}:${r.id}`, {
          kind,
          articleId: r.id,
          title: r.title,
          subtitle: kind === "highlights" ? "Your highlights" : r.site || undefined,
        });
      }
    }
  }
  return out;
}

/** Search the library by meaning (or keywords without pgvector), one hit per doc. */
export async function searchLibrary(
  userId: string,
  { q }: z.output<typeof searchQuery>,
): Promise<{ semantic: boolean; hits: LibraryHit[] }> {
  const { semantic, chunks } = await retrieve(userId, q, 60);
  const best = new Map<string, Chunk>();
  for (const c of chunks) {
    const key = `${c.kind}:${c.refId}`;
    if (!best.has(key)) best.set(key, c);
  }
  const top = [...best.values()].slice(0, 20);
  const info = await describe(userId, top);
  const hits: LibraryHit[] = [];
  for (const c of top) {
    const source = info.get(`${c.kind}:${c.refId}`);
    if (!source) continue;
    const body = c.content.split("\n").slice(1).join(" ") || c.content;
    hits.push({ ...source, snippet: clipText(body, 240), score: c.score });
  }
  return { semantic, hits };
}

/** One "Ask your library" turn, answered from the best-matching passages. */
export async function askLibrary(
  userId: string,
  body: z.output<typeof chatTurnInput>,
): Promise<Response> {
  const history = chatHistory(body);
  const last = history.at(-1)!;
  const question = last.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ");
  const { chunks } = await retrieve(userId, question.slice(0, 1000), 10);
  const info = await describe(userId, chunks);

  // Number sources by doc so several chunks of one article share a citation.
  const numbers = new Map<string, number>();
  const sources: Array<LibrarySource & { n: number }> = [];
  const documents: string[] = [];
  for (const c of chunks) {
    const key = `${c.kind}:${c.refId}`;
    const source = info.get(key);
    if (!source) continue;
    let n = numbers.get(key);
    if (n === undefined) {
      n = numbers.size + 1;
      numbers.set(key, n);
      sources.push({ ...source, n });
    }
    documents.push(asDocument(clipText(c.content, 2500), { n: String(n), title: source.title }));
  }

  return streamChat({
    instructions: [
      "You answer questions from the reader's own library: saved articles and their highlights and notes.",
      "The passages below were retrieved for the latest question. Answer from them and cite them inline as [1], [2] using each document's n.",
      "If the passages don't answer the question, say what the library does and doesn't contain; don't invent sources.",
      "Be concise and use the reader's language.",
      "",
      documents.length
        ? documents.join("\n\n")
        : "(No matching passages were found in the library.)",
    ].join("\n"),
    history,
    metadata: { sources },
  });
}
