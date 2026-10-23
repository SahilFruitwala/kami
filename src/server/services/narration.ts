import "@tanstack/react-start/server-only";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { getDeadline } from "@vercel/functions";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { NarrationView, StartNarrationResult } from "@/lib/api/narration";
import type { OpenReservation } from "@/lib/allowance.ts";
import {
  AllowanceShortError,
  allowanceBalance,
  releaseAllowance,
  reserveAllowance,
} from "@/lib/allowance-db.server.ts";
import { getDb } from "@/lib/db";
import { joinMp3 } from "@/lib/mp3.ts";
import { narrationConfig, type NarrationConfig } from "@/lib/narration-config.server.ts";
import {
  ACTIVE_STATES,
  applyEvent,
  isStalled,
  nextStep,
  refuseStart,
  resume,
  settleReservation,
  startKind,
  type Narration,
  type NarrationState,
} from "@/lib/narration-engine.ts";
import { MAX_SCRIPT_CHARS, buildNarrationScript } from "@/lib/narration-script.server.ts";
import { AUDIO_CONTENT_TYPE, narrationKeys, type ObjectStore } from "@/lib/object-store.ts";
import { createR2Store } from "@/lib/r2.server.ts";
import { isUniqueViolation } from "@/lib/shelves-db.server.ts";
import { articles, narrations, r2Orphans } from "@/lib/schema";
import {
  NARRATION_MODEL,
  SpeechError,
  deepgramSpeechModel,
  speakPart,
} from "@/lib/speech.server.ts";
import { asTidyState } from "@/lib/tidy-state.ts";
import { runInBackground } from "@/server/background";
import { HttpError, notFound } from "@/server/http";

/**
 * Narration: an article's full text spoken by Deepgram and stored privately
 * in R2, made only when its owner asks. The decisions live in the pure
 * engine (src/lib/narration-engine.ts); this module does the I/O around it.
 * Every entry point is scoped to the caller's own articles; a run continues
 * in the background with waitUntil and re-invokes itself before the
 * function's time runs out (docs/adr/0001).
 */

/** Presigned audio URLs last this long; the player asks again when one expires. */
export const AUDIO_URL_SECONDS = 15 * 60;
/** Without a platform deadline (local dev), give each run this long. */
const FALLBACK_RUN_MS = 240_000;

type Row = typeof narrations.$inferSelect;

const hashHtml = (html: string) => createHash("sha256").update(html).digest("hex");
const isStubHtml = (html: string) => !html.trim() || html.includes("Saved as a link.");

function requireConfig(): NarrationConfig {
  const config = narrationConfig();
  if (!config) throw new HttpError(503, "Narration isn't set up on this server.");
  return config;
}

const storeFor = (config: NarrationConfig): ObjectStore => createR2Store(config.r2);

function toEngine(row: Row): Narration {
  return {
    state: row.state as NarrationState,
    pausedReason: row.pausedReason,
    parts: row.parts,
    partsDone: row.partsDone,
    reservedChars: row.reservedChars,
    charsSpoken: row.charsSpoken,
    tidyAttempted: row.tidyAttempted,
    leaseUntil: row.leaseUntil?.getTime() ?? null,
    runId: row.runId,
  };
}

function toView(row: Row, currentHash: string | null): NarrationView {
  return {
    state: row.state as NarrationState,
    pausedReason: row.pausedReason,
    partsDone: row.partsDone,
    partsTotal: row.parts.length,
    scriptChars: row.reservedChars,
    stale: currentHash !== null && currentHash !== row.contentHash,
    durationSeconds: row.durationSeconds,
    positionSeconds: row.positionSeconds,
    createdAt: row.createdAt.getTime(),
  };
}

/** All of a narration's possible objects: every part key plus the joined file. */
function objectKeys(row: Pick<Row, "id" | "userId" | "articleId" | "parts" | "audioKey">) {
  const keys = narrationKeys(row.userId, row.articleId, row.id);
  return [...row.parts.map((_, i) => keys.part(i)), row.audioKey ?? keys.audio];
}

/** Delete objects; any that fail are remembered for a later sweep. */
async function deleteObjects(store: ObjectStore, keys: string[]) {
  const failed: string[] = [];
  await Promise.all(keys.map((key) => store.delete(key).catch(() => failed.push(key))));
  if (!failed.length) return;
  const db = await getDb();
  await db
    .insert(r2Orphans)
    .values(failed.map((key) => ({ key })))
    .onConflictDoNothing();
}

/** Retry a few orphaned deletes; cheap, and runs only when narration is used. */
async function sweepOrphans(store: ObjectStore) {
  const db = await getDb();
  const rows = await db.select().from(r2Orphans).limit(20);
  for (const row of rows) {
    try {
      await store.delete(row.key);
      await db.delete(r2Orphans).where(eq(r2Orphans.key, row.key));
    } catch {
      await db
        .update(r2Orphans)
        .set({ attempts: sql`${r2Orphans.attempts} + 1` })
        .where(eq(r2Orphans.key, row.key));
    }
  }
}

async function loadArticle(userId: string, articleId: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      id: articles.id,
      title: articles.title,
      author: articles.author,
      siteName: articles.siteName,
      html: articles.contentHtml,
      tidyState: articles.tidyState,
    })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)))
    .limit(1);
  if (!row) throw notFound("That article is no longer in your library.");
  return row;
}

async function loadNarration(userId: string, articleId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ narration: narrations, html: articles.contentHtml })
    .from(narrations)
    .innerJoin(articles, eq(articles.id, narrations.articleId))
    .where(and(eq(narrations.articleId, articleId), eq(narrations.userId, userId)))
    .limit(1);
  return row ?? null;
}

// ---------- owner-facing ----------

/** The article's narration, or null. A stalled run is restarted as a side effect. */
export async function getNarration(
  userId: string,
  articleId: string,
  origin: string,
): Promise<NarrationView | null> {
  const found = await loadNarration(userId, articleId);
  if (!found) return null;
  if (narrationConfig() && isStalled(toEngine(found.narration), Date.now())) {
    kickRun(found.narration.id, origin);
  }
  return toView(found.narration, hashHtml(found.html));
}

/** Create audio: create, resume, re-create (when stale) or just report. */
export async function startNarration(
  userId: string,
  articleId: string,
  origin: string,
): Promise<StartNarrationResult> {
  const config = requireConfig();
  runInBackground("narration-orphans", () => sweepOrphans(storeFor(config)));
  const article = await loadArticle(userId, articleId);
  const currentHash = hashHtml(article.html);
  const found = await loadNarration(userId, articleId);
  const existing = found?.narration ?? null;
  const kind = startKind(existing && toEngine(existing), existing?.contentHash !== currentHash);
  const db = await getDb();

  if (existing && (kind === "running" || kind === "ready")) {
    if (kind === "running" && isStalled(toEngine(existing), Date.now()))
      kickRun(existing.id, origin);
    return { ok: true, narration: toView(existing, currentHash) };
  }
  if (existing && kind === "resume") {
    const next = resume(toEngine(existing));
    const [row] = await db
      .update(narrations)
      .set({
        state: next.state,
        pausedReason: null,
        leaseUntil: null,
        runId: null,
        updatedAt: new Date(),
      })
      .where(and(eq(narrations.id, existing.id), eq(narrations.state, "paused")))
      .returning();
    kickRun(existing.id, origin);
    return { ok: true, narration: toView(row ?? existing, currentHash) };
  }

  // create or recreate: everything is refused before any Deepgram call.
  const script = buildNarrationScript({
    title: article.title,
    author: article.author,
    siteName: article.siteName,
    html: article.html,
  });
  const available = await allowanceBalance(db, userId);
  const refusal = refuseStart({
    isStub: isStubHtml(article.html),
    english: script.english,
    chars: script.chars,
    limit: MAX_SCRIPT_CHARS,
    available,
  });
  if (refusal) return { ok: false, refusal };

  const id = randomUUID();
  let row: Row;
  try {
    row = await db.transaction(async (tx) => {
      if (existing) await tx.delete(narrations).where(eq(narrations.id, existing.id));
      await reserveAllowance(db, userId, script.chars, id, article.title.slice(0, 120), tx);
      const [inserted] = await tx
        .insert(narrations)
        .values({
          id,
          articleId,
          userId,
          state: "queued",
          model: NARRATION_MODEL,
          contentHash: currentHash,
          parts: script.parts,
          reservedChars: script.chars,
        })
        .returning();
      return inserted;
    });
  } catch (err) {
    if (err instanceof AllowanceShortError) {
      return {
        ok: false,
        refusal: { code: "no_allowance", needed: err.needed, available: err.available },
      };
    }
    // A second click raced the first one in: report the narration it created.
    if (isUniqueViolation(err)) {
      const raced = await loadNarration(userId, articleId);
      if (raced) return { ok: true, narration: toView(raced.narration, currentHash) };
    }
    throw err;
  }
  if (existing)
    runInBackground("narration-replace", () =>
      deleteObjects(storeFor(config), objectKeys(existing)),
    );
  kickRun(id, origin);
  return { ok: true, narration: toView(row, currentHash) };
}

/** Delete audio. An unfinished narration gives back what it hasn't spoken. */
export async function deleteNarration(userId: string, articleId: string): Promise<void> {
  const config = requireConfig();
  const found = await loadNarration(userId, articleId);
  if (!found) return;
  const db = await getDb();
  await db.delete(narrations).where(eq(narrations.id, found.narration.id));
  await settleDeleted([found.narration], config);
}

/** Return unspoken reservations and delete objects for narrations already removed from the DB. */
async function settleDeleted(rows: Row[], config: NarrationConfig | null) {
  const db = await getDb();
  for (const row of rows) {
    if (row.state !== "ready") {
      await releaseAllowance(db, row.userId, settleReservation(row), row.id, "audio deleted");
    }
  }
  if (!config) return;
  await deleteObjects(storeFor(config), rows.flatMap(objectKeys));
}

/**
 * Call around deleting articles (one, or the whole library): narrations
 * cascade with their article in Postgres, but their R2 objects and unspoken
 * reservations don't. Returns a function to run after the delete.
 */
export async function prepareArticleDelete(
  userId: string,
  articleIds: string[] | "all",
): Promise<() => Promise<void>> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(narrations)
    .where(
      articleIds === "all"
        ? eq(narrations.userId, userId)
        : and(eq(narrations.userId, userId), inArray(narrations.articleId, articleIds)),
    );
  if (!rows.length) return async () => {};
  return () => settleDeleted(rows, narrationConfig());
}

export const positionBody = z.object({
  seconds: z
    .number()
    .min(0)
    .max(24 * 60 * 60),
});

export async function saveNarrationPosition(
  userId: string,
  articleId: string,
  seconds: number,
): Promise<void> {
  const db = await getDb();
  await db
    .update(narrations)
    .set({ positionSeconds: seconds })
    .where(and(eq(narrations.articleId, articleId), eq(narrations.userId, userId)));
}

/** A short-lived URL for the finished audio, only for its owner. */
export async function narrationAudioUrl(
  userId: string,
  articleId: string,
): Promise<{ url: string; expiresAt: number }> {
  const config = requireConfig();
  const found = await loadNarration(userId, articleId);
  if (!found || found.narration.state !== "ready" || !found.narration.audioKey) {
    throw notFound("This article has no audio yet.");
  }
  const url = await storeFor(config).presignGet(found.narration.audioKey, AUDIO_URL_SECONDS);
  return { url, expiresAt: Date.now() + AUDIO_URL_SECONDS * 1000 };
}

/** Reservations still held by the user's unfinished narrations. */
export async function openReservations(userId: string): Promise<OpenReservation[]> {
  const db = await getDb();
  const rows = await db
    .select({ reserved: narrations.reservedChars, spoken: narrations.charsSpoken })
    .from(narrations)
    .where(
      and(eq(narrations.userId, userId), inArray(narrations.state, [...ACTIVE_STATES, "paused"])),
    );
  return rows;
}

// ---------- the background run ----------

/** Start (or continue) a run after the response, within this invocation. */
function kickRun(narrationId: string, origin: string) {
  runInBackground("narration", () => runNarration(narrationId, origin));
}

/** The internal run endpoint's secret check (constant time). */
export function runSecretMatches(given: string | null): boolean {
  const config = narrationConfig();
  if (!config || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(config.runSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const runBody = z.object({ narrationId: z.string().min(1).max(100) });

/** Handle a hand-off call: continue the run in this new invocation. */
export function continueRun(narrationId: string, origin: string) {
  kickRun(narrationId, origin);
}

/** Re-invoke ourselves to continue in a fresh invocation (fresh time budget). */
async function handOff(narrationId: string, origin: string, config: NarrationConfig) {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  const base = vercelUrl ? `https://${vercelUrl}` : origin;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-narration-secret": config.runSecret,
  };
  if (config.protectionBypass) headers["x-vercel-protection-bypass"] = config.protectionBypass;
  // Awaited inside waitUntil: a fire-and-forget fetch may never leave a
  // function that is about to end. The callee answers 202 straight away.
  const res = await fetch(`${base}/api/narrations/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({ narrationId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status !== 202) throw new Error(`narration hand-off got ${res.status}`);
}

async function runNarration(narrationId: string, origin: string): Promise<void> {
  const config = narrationConfig();
  if (!config) return;
  const startedAt = Date.now();
  const deadline = getDeadline()?.getTime() ?? startedAt + FALLBACK_RUN_MS;
  const runId = randomUUID();
  const db = await getDb();
  const store = storeFor(config);
  const model = deepgramSpeechModel(config.deepgramApiKey);

  // Claim: only an active narration whose lease is free, expired or ours.
  const now = new Date();
  const [claimed] = await db
    .update(narrations)
    .set({
      runId,
      leaseUntil: new Date(now.getTime() + 90_000),
      state: sql`case when ${narrations.state} = 'queued' then 'narrating' else ${narrations.state} end`,
      updatedAt: now,
    })
    .where(
      and(
        eq(narrations.id, narrationId),
        inArray(narrations.state, [...ACTIVE_STATES]),
        sql`(${narrations.leaseUntil} is null or ${narrations.leaseUntil} < now() or ${narrations.runId} = ${runId})`,
      ),
    )
    .returning();
  if (!claimed) return;

  let row = claimed;
  let n = applyEvent(toEngine(row), { type: "claimed", runId, now: now.getTime() });

  /** Write the engine's state; false when the narration is gone or another run took it. */
  const persist = async (extra: Partial<typeof narrations.$inferInsert> = {}) => {
    const [updated] = await db
      .update(narrations)
      .set({
        state: n.state,
        pausedReason: n.pausedReason,
        parts: n.parts,
        partsDone: n.partsDone,
        charsSpoken: n.charsSpoken,
        tidyAttempted: n.tidyAttempted,
        leaseUntil: n.leaseUntil === null ? null : new Date(n.leaseUntil),
        runId: n.runId,
        updatedAt: new Date(),
        ...extra,
      })
      .where(and(eq(narrations.id, narrationId), eq(narrations.runId, runId)))
      .returning();
    if (updated) row = updated;
    return Boolean(updated);
  };

  const keys = narrationKeys(row.userId, row.articleId, row.id);

  for (let step = 0; step < 1000; step++) {
    const [article] = await db
      .select({ tidyState: articles.tidyState })
      .from(articles)
      .where(eq(articles.id, row.articleId))
      .limit(1);
    const action = nextStep(n, {
      now: Date.now(),
      runId,
      timeLeftMs: deadline - Date.now(),
      tidyState: asTidyState(article?.tidyState),
      deleted: !article,
    });

    if (action.type === "exit") return;

    if (action.type === "hand-off") {
      // Free the lease so the next invocation can claim it at once.
      n = { ...n, leaseUntil: null, runId: null };
      if (!(await persist())) return;
      try {
        await handOff(narrationId, origin, config);
      } catch (err) {
        // The lease expires and the owner's next status check restarts the run.
        console.error("[narration] hand-off failed", err);
      }
      return;
    }

    if (action.type === "tidy") {
      n = applyEvent(n, { type: "tidying" });
      if (!(await persist())) return;
      let parts: string[] | null = null;
      let contentHash: string | undefined;
      try {
        const { tidyArticle } = await import("@/server/services/ai-articles");
        const { item } = await tidyArticle(row.userId, row.articleId);
        parts = buildNarrationScript({
          title: item.title,
          author: item.author,
          siteName: item.siteName,
          html: item.contentHtml,
        }).parts;
        contentHash = hashHtml(item.contentHtml);
      } catch (err) {
        // Narrate the untidied text rather than block on a failed clean-up.
        console.warn("[narration] tidy failed, narrating as saved", err);
      }
      const before = n.parts;
      n = applyEvent(n, { type: "tidied", parts });
      const swapped = n.parts !== before;
      if (!(await persist(swapped && contentHash ? { contentHash } : {}))) return;
      continue;
    }

    if (action.type === "speak") {
      const text = n.parts[action.index];
      try {
        const spoken = await speakPart(model, text);
        await store.put(keys.part(action.index), spoken.audio, AUDIO_CONTENT_TYPE);
        n = applyEvent(n, {
          type: "spoken",
          index: action.index,
          chars: spoken.chars ?? text.length,
          now: Date.now(),
        });
      } catch (err) {
        const reason =
          err instanceof SpeechError
            ? err.kind === "permanent"
              ? err.message
              : "Deepgram didn't answer. Resume to try again."
            : "Saving the audio failed. Resume to try again.";
        console.error("[narration] part failed", err);
        n = applyEvent(n, { type: "failed", reason });
        await persist();
        return;
      }
      if (!(await persist())) {
        // Deleted or taken over while speaking: don't leave this part behind.
        await deleteObjects(store, [keys.part(action.index)]);
        return;
      }
      continue;
    }

    if (action.type === "join") {
      try {
        const parts = await Promise.all(n.parts.map((_, i) => store.get(keys.part(i))));
        const missing = parts.findIndex((p) => p === null);
        if (missing !== -1) throw new Error(`part ${missing + 1} is missing`);
        const joined = joinMp3(parts as Uint8Array[]);
        await store.put(keys.audio, joined.bytes, AUDIO_CONTENT_TYPE);
        n = applyEvent(n, { type: "joined" });
        const ok = await persist({
          audioKey: keys.audio,
          durationSeconds: joined.durationSeconds,
          bytes: joined.bytes.byteLength,
          finishedAt: new Date(),
        });
        if (!ok) {
          await deleteObjects(store, [keys.audio]);
          return;
        }
        // Whatever was reserved but not spoken (a shorter tidied script) returns.
        await releaseAllowance(db, row.userId, settleReservation(n), row.id, "narration finished");
        await deleteObjects(
          store,
          n.parts.map((_, i) => keys.part(i)),
        );
      } catch (err) {
        console.error("[narration] join failed", err);
        n = applyEvent(n, {
          type: "failed",
          reason: "Joining the audio failed. Resume to try again.",
        });
        await persist();
      }
      return;
    }
  }
}
