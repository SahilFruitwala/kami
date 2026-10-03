import { and, eq, inArray } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { rateLimited } from "@/lib/rate-limit-middleware.ts";
import { CacheTTL, cacheKey, cached, invalidateUserCache } from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db";
import { listMembers, tvShows, watchedEpisodes } from "@/lib/schema";

/**
 * TV episode tracking — Postgres port of `shelf/src/server/episodes.ts`.
 * Season/episode structure comes from TMDB; ticks live in `watched_episodes`.
 */

export type EpisodeRow = {
  season: number;
  number: number;
  title: string;
  airDate: string | null;
  watched: boolean;
};

export type SeasonRow = {
  season: number;
  name: string;
  episodeCount: number;
  watchedCount: number;
};

type TmdbSeasonSummary = {
  season_number: number;
  name?: string;
  episode_count?: number;
};

type TmdbEpisode = {
  season_number: number;
  episode_number: number;
  name?: string;
  air_date?: string | null;
};

const TMDB_TTL_MS = 6 * 60 * 60 * 1000;
const TMDB_CACHE_MAX = 500;
const tmdbCache = new Map<string, { at: number; value: unknown }>();

async function tmdbFetch<T>(path: string): Promise<T | null> {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) return null;

  const hit = tmdbCache.get(path);
  if (hit && Date.now() - hit.at < TMDB_TTL_MS) return hit.value as T;

  // L1 above absorbs repeats inside a warm instance; Upstash is the shared
  // L2 so every serverless instance benefits. Failures (null) are never
  // cached — they usually mean an upstream blip, not "no such season".
  const value = await cached(
    cacheKey("lookup", "tmdb", ...path.split("/").filter(Boolean)),
    CacheTTL.tmdbSearch,
    async (): Promise<T | null> => {
      const res = await fetch(`https://api.themoviedb.org/3/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    },
    { skipCache: (v) => v === null },
  );

  if (value !== null) {
    if (tmdbCache.size >= TMDB_CACHE_MAX) {
      const oldest = tmdbCache.keys().next().value;
      if (oldest !== undefined) tmdbCache.delete(oldest);
    }
    tmdbCache.set(path, { at: Date.now(), value });
  }
  return value;
}

/** Owner-scoped show fetch — missing row and “not yours” look the same. */
async function requireShow(userId: string, itemId: string) {
  const db = await getDb();
  const rows = await db
    .select({ item: tvShows })
    .from(tvShows)
    .innerJoin(
      listMembers,
      and(eq(listMembers.listId, tvShows.listId), eq(listMembers.userId, userId)),
    )
    .where(eq(tvShows.id, itemId))
    .limit(1);
  const item = rows[0]?.item;
  if (!item) throw new Error("Item not found");
  return { db, item };
}

const WATCHED_INSERT_CHUNK = 400;

function chunkRows<T>(rows: T[], size = WATCHED_INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function insertWatchedInChunks(
  db: Awaited<ReturnType<typeof getDb>>,
  rows: (typeof watchedEpisodes.$inferInsert)[],
) {
  for (const chunk of chunkRows(rows)) {
    await db.insert(watchedEpisodes).values(chunk).onConflictDoNothing();
  }
}

async function syncShowProgress(itemId: string) {
  const db = await getDb();
  const rows = await db
    .select({ season: watchedEpisodes.season, number: watchedEpisodes.number })
    .from(watchedEpisodes)
    .where(eq(watchedEpisodes.itemId, itemId));

  const last = rows.reduce<{ season: number; number: number } | null>((acc, r) => {
    if (!acc || r.season > acc.season || (r.season === acc.season && r.number > acc.number)) {
      return r;
    }
    return acc;
  }, null);

  await db
    .update(tvShows)
    .set({
      episodesWatched: rows.length,
      lastEpisode: last ? `S${last.season}E${last.number}` : null,
    })
    .where(eq(tvShows.id, itemId));
}

export const getShowSeasons = createServerFn({ method: "GET" })
  .middleware([rateLimited("lookup")])
  .validator((input: unknown) => z.object({ itemId: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ context, data }) => {
    // Seasons mix shared TMDB structure with per-user ticks — cache the
    // merged result per user; episode mutations invalidate the prefix.
    // (The totalEpisodes self-heal below then runs at most once per TTL.)
    return cached(
      cacheKey("u", context.userId, "shelves", "seasons", data.itemId),
      CacheTTL.shelfReads,
      async () => {
        const { db, item } = await requireShow(context.userId, data.itemId);
        const empty = {
          seasons: [] as SeasonRow[],
          hasTmdb: false,
          watchedTotal: 0,
          unmatched: 0,
        };

        const tmdbId = item.tmdbId != null ? String(item.tmdbId) : "";
        if (!tmdbId) return empty;

        const show = await tmdbFetch<{ seasons?: TmdbSeasonSummary[] }>(`tv/${tmdbId}`);
        if (!show?.seasons) return empty;

        const watched = await db
          .select({ season: watchedEpisodes.season })
          .from(watchedEpisodes)
          .where(eq(watchedEpisodes.itemId, data.itemId));

        const watchedBySeason = new Map<number, number>();
        for (const w of watched) {
          watchedBySeason.set(w.season, (watchedBySeason.get(w.season) ?? 0) + 1);
        }

        const seasons: SeasonRow[] = show.seasons.map((s) => ({
          season: s.season_number,
          name: s.name?.trim() || `Season ${s.season_number}`,
          episodeCount: s.episode_count ?? 0,
          watchedCount: watchedBySeason.get(s.season_number) ?? 0,
        }));

        const totalEpisodes = seasons.reduce((n, s) => n + s.episodeCount, 0);
        if (item.totalEpisodes !== totalEpisodes && totalEpisodes > 0) {
          await db.update(tvShows).set({ totalEpisodes }).where(eq(tvShows.id, data.itemId));
        }

        const placed = seasons.reduce((n, s) => n + s.watchedCount, 0);
        return {
          seasons,
          hasTmdb: true,
          watchedTotal: watched.length,
          unmatched: watched.length - placed,
        };
      },
    );
  });

export const getSeasonEpisodes = createServerFn({ method: "GET" })
  .middleware([rateLimited("lookup")])
  .validator((input: unknown) =>
    z
      .object({
        itemId: z.string().min(1).max(200),
        season: z.number().int().min(0).max(10_000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<EpisodeRow[]> => {
    // Episode rows merge shared TMDB data with per-user ticks — same
    // per-user caching as seasons; ticks invalidate on toggle below.
    return cached(
      cacheKey("u", context.userId, "shelves", "episodes", data.itemId, String(data.season)),
      CacheTTL.shelfReads,
      async (): Promise<EpisodeRow[]> => {
        const { db, item } = await requireShow(context.userId, data.itemId);
        const tmdbId = item.tmdbId != null ? String(item.tmdbId) : "";
        if (!tmdbId) return [];

        const [season, watched] = await Promise.all([
          tmdbFetch<{ episodes?: TmdbEpisode[] }>(`tv/${tmdbId}/season/${data.season}`),
          db
            .select({ number: watchedEpisodes.number })
            .from(watchedEpisodes)
            .where(
              and(eq(watchedEpisodes.itemId, data.itemId), eq(watchedEpisodes.season, data.season)),
            ),
        ]);
        if (!season?.episodes) return [];

        const seen = new Set(watched.map((w) => w.number));
        return season.episodes.map((e) => ({
          season: e.season_number,
          number: e.episode_number,
          title: e.name?.trim() || `Episode ${e.episode_number}`,
          airDate: e.air_date ?? null,
          watched: seen.has(e.episode_number),
        }));
      },
      { skipCache: (rows) => rows.length === 0 },
    );
  });

export const toggleEpisode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        itemId: z.string().min(1).max(200),
        season: z.number().int().min(0).max(10_000),
        number: z.number().int().min(0).max(100_000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { db } = await requireShow(context.userId, data.itemId);

    const existing = await db
      .select({ id: watchedEpisodes.id })
      .from(watchedEpisodes)
      .where(
        and(
          eq(watchedEpisodes.itemId, data.itemId),
          eq(watchedEpisodes.season, data.season),
          eq(watchedEpisodes.number, data.number),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db.delete(watchedEpisodes).where(eq(watchedEpisodes.id, existing[0].id));
      await syncShowProgress(data.itemId);
      await invalidateUserCache(context.userId);
      return { watched: false };
    }

    await db
      .insert(watchedEpisodes)
      .values({
        id: crypto.randomUUID(),
        itemId: data.itemId,
        season: data.season,
        number: data.number,
        watchedAt: new Date(),
      })
      .onConflictDoNothing();

    await syncShowProgress(data.itemId);
    await invalidateUserCache(context.userId);
    return { watched: true };
  });

export const setSeasonWatched = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const data = z
      .object({
        itemId: z.string().min(1).max(200),
        season: z.number().int().min(0).max(10_000),
        numbers: z.array(z.number().int().min(0).max(100_000)).max(2000),
        watched: z.boolean(),
      })
      .parse(input);
    return data;
  })
  .handler(async ({ context, data }) => {
    const { db } = await requireShow(context.userId, data.itemId);
    if (data.numbers.length === 0) return;

    if (data.watched) {
      const existing = await db
        .select({ number: watchedEpisodes.number })
        .from(watchedEpisodes)
        .where(
          and(eq(watchedEpisodes.itemId, data.itemId), eq(watchedEpisodes.season, data.season)),
        );
      const seen = new Set(existing.map((e) => e.number));
      const missing = data.numbers.filter((n) => !seen.has(n));
      await insertWatchedInChunks(
        db,
        missing.map((number) => ({
          id: crypto.randomUUID(),
          itemId: data.itemId,
          season: data.season,
          number,
          watchedAt: new Date(),
        })),
      );
    } else {
      await db
        .delete(watchedEpisodes)
        .where(
          and(
            eq(watchedEpisodes.itemId, data.itemId),
            eq(watchedEpisodes.season, data.season),
            inArray(watchedEpisodes.number, data.numbers),
          ),
        );
    }

    await syncShowProgress(data.itemId);
    await invalidateUserCache(context.userId);
  });

/** Mark every TMDB episode watched, or clear all ticks. Also sets show status. */
export const setShowWatched = createServerFn({ method: "POST" })
  .middleware([rateLimited("lookup")])
  .validator((input: unknown) =>
    z.object({ itemId: z.string().min(1).max(200), watched: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { db, item } = await requireShow(context.userId, data.itemId);

    if (!data.watched) {
      await db.delete(watchedEpisodes).where(eq(watchedEpisodes.itemId, data.itemId));
      await syncShowProgress(data.itemId);
      await db
        .update(tvShows)
        .set({ status: "to_try", completedAt: null })
        .where(eq(tvShows.id, data.itemId));
      await invalidateUserCache(context.userId);
      return;
    }

    const tmdbId = item.tmdbId != null ? String(item.tmdbId) : "";
    if (tmdbId) {
      const show = await tmdbFetch<{ seasons?: TmdbSeasonSummary[] }>(`tv/${tmdbId}`);
      if (show?.seasons) {
        const seasonEpisodes = await Promise.all(
          show.seasons.map((s) =>
            tmdbFetch<{ episodes?: TmdbEpisode[] }>(`tv/${tmdbId}/season/${s.season_number}`),
          ),
        );
        const existing = await db
          .select({ season: watchedEpisodes.season, number: watchedEpisodes.number })
          .from(watchedEpisodes)
          .where(eq(watchedEpisodes.itemId, data.itemId));
        const seen = new Set(existing.map((e) => `${e.season}:${e.number}`));
        const toInsert: (typeof watchedEpisodes.$inferInsert)[] = [];
        show.seasons.forEach((s, i) => {
          for (const e of seasonEpisodes[i]?.episodes ?? []) {
            const key = `${s.season_number}:${e.episode_number}`;
            if (seen.has(key)) continue;
            seen.add(key);
            toInsert.push({
              id: crypto.randomUUID(),
              itemId: data.itemId,
              season: s.season_number,
              number: e.episode_number,
              watchedAt: new Date(),
            });
          }
        });
        await insertWatchedInChunks(db, toInsert);
        await syncShowProgress(data.itemId);
      }
    }

    await db
      .update(tvShows)
      .set({ status: "done", completedAt: new Date() })
      .where(eq(tvShows.id, data.itemId));
    await invalidateUserCache(context.userId);
  });
