import { and, count, eq, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { invalidateUserCache } from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db";
import { articles, folders } from "@/lib/schema";
import type { Folder } from "@/lib/store";
import { normalizeTag, uid } from "@/lib/store";
import {
  clampLibraryItemInput,
  libraryItemSchema,
  loadSnapshot,
  sanitizeStoredHtml,
} from "@/lib/library-rows.server.ts";
import type { LibrarySnapshot } from "@/lib/library-fns.ts";

/** Delete every article + folder owned by this user. Scoped by userId —
 *  nothing outside the caller's account is touched. */
export const wipeLibrary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const db = await getDb();
    // One transaction: a failure part-way never leaves a half-wiped account.
    await db.transaction(async (tx) => {
      await tx.delete(articles).where(eq(articles.userId, context.userId));
      await tx.delete(folders).where(eq(folders.userId, context.userId));
    });
    await invalidateUserCache(context.userId);
    return { ok: true };
  });

export const addLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().min(1).max(200).optional(),
        name: z.string().trim().min(1).max(32),
      })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<Folder> => {
    const db = await getDb();
    const name = data.name.trim().slice(0, 32);
    const existing = await db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(and(eq(folders.userId, context.userId), sql`lower(${folders.name}) = lower(${name})`))
      .limit(1);
    if (existing[0]) return { id: existing[0].id, name: existing[0].name };

    const [{ value: folderCount }] = await db
      .select({ value: count() })
      .from(folders)
      .where(eq(folders.userId, context.userId));
    if (Number(folderCount) >= 24) {
      throw new Error("Folder limit reached.");
    }

    // IDs are a global primary key. Never let a caller-supplied id overwrite a
    // row owned by another user (onConflictDoUpdate without a userId scope
    // would rename a victim's folder). If the id is taken by anyone else,
    // mint a fresh one; only the owner's own retry is idempotent.
    let id = data.id || uid();
    if (data.id) {
      const byId = await db
        .select({ id: folders.id, userId: folders.userId, name: folders.name })
        .from(folders)
        .where(eq(folders.id, data.id))
        .limit(1);
      if (byId[0]) {
        if (byId[0].userId === context.userId) return { id: byId[0].id, name: byId[0].name };
        id = uid();
      }
    }
    await db
      .insert(folders)
      .values({ id, userId: context.userId, name })
      .onConflictDoNothing({ target: folders.id });
    await invalidateUserCache(context.userId);
    // Confirm ownership (a concurrent insert winning the race returns its row
    // only when we own it; otherwise fall back to the name lookup above).
    const owned = await db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(and(eq(folders.id, id), eq(folders.userId, context.userId)))
      .limit(1);
    if (owned[0]) return { id: owned[0].id, name: owned[0].name };
    return { id, name };
  });

export const renameLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    z
      .object({ id: z.string().min(1).max(200), name: z.string().trim().min(1).max(32) })
      .parse(input),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const db = await getDb();
    const name = data.name.trim().slice(0, 32);
    await db
      .update(folders)
      .set({ name })
      .where(and(eq(folders.id, data.id), eq(folders.userId, context.userId)));
    await invalidateUserCache(context.userId);
    return { ok: true };
  });

export const removeLibraryFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => z.object({ id: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx
        .update(articles)
        .set({ folderId: null })
        .where(and(eq(articles.userId, context.userId), eq(articles.folderId, data.id)));
      await tx
        .delete(folders)
        .where(and(eq(folders.id, data.id), eq(folders.userId, context.userId)));
    });
    await invalidateUserCache(context.userId);
    return { ok: true };
  });

export const importLibrarySnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw =
      input && typeof input === "object"
        ? (input as { library?: unknown; folders?: unknown })
        : null;
    return z
      .object({
        library: z.array(libraryItemSchema).max(200),
        folders: z
          .array(z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(32) }))
          .max(24),
      })
      .parse({
        library: Array.isArray(raw?.library)
          ? raw.library.map(clampLibraryItemInput)
          : raw?.library,
        folders: raw?.folders,
      });
  })
  .handler(async ({ context, data }): Promise<LibrarySnapshot> => {
    const db = await getDb();
    const [{ value: existingCount }] = await db
      .select({ value: count() })
      .from(articles)
      .where(eq(articles.userId, context.userId));

    // Only import local leftovers when the account library is empty.
    // (The tail of this handler invalidates + reloads after writing.)
    if (Number(existingCount) > 0) {
      return loadSnapshot(context.userId);
    }

    // Sanitize outside the transaction so it doesn't hold a connection.
    const items = data.library.slice(0, 200);
    const bodies = await Promise.all(
      items.map((item) => sanitizeStoredHtml(item.contentHtml, item.canonicalUrl || item.url)),
    );

    await db.transaction(async (tx) => {
      for (const folder of data.folders.slice(0, 24)) {
        // Remap ids already taken by another tenant so we never link to (or
        // silently collide with) a foreign folder row.
        const taken = await tx
          .select({ id: folders.id, userId: folders.userId })
          .from(folders)
          .where(eq(folders.id, folder.id))
          .limit(1);
        let folderId = folder.id;
        if (taken[0] && taken[0].userId !== context.userId) {
          folderId = uid();
          for (const item of data.library) {
            if (item.folderId === folder.id) item.folderId = folderId;
          }
        }
        await tx
          .insert(folders)
          .values({
            id: folderId,
            userId: context.userId,
            name: folder.name.trim().slice(0, 32),
          })
          .onConflictDoNothing({ target: folders.id });
      }

      const ownedFolderIds = new Set(
        (
          await tx
            .select({ id: folders.id })
            .from(folders)
            .where(eq(folders.userId, context.userId))
        ).map((f) => f.id),
      );

      for (const [index, item] of items.entries()) {
        const tags = item.tags.map(normalizeTag).filter(Boolean).slice(0, 12);
        const highlights = item.highlights.slice(0, 80);
        const folderId = item.folderId && ownedFolderIds.has(item.folderId) ? item.folderId : null;
        const contentHtml = bodies[index]!;
        // An id owned by another user gets one retry with a fresh id; a
        // duplicate canonical URL within the import is skipped.
        for (const id of [item.id, uid()]) {
          const inserted = await tx
            .insert(articles)
            .values({
              id,
              userId: context.userId,
              url: item.url,
              canonicalUrl: item.canonicalUrl,
              title: item.title,
              author: item.author,
              siteName: item.siteName,
              source: item.source,
              wordCount: item.wordCount,
              readingMinutes: item.readingMinutes,
              excerpt: item.excerpt,
              contentHtml,
              heroImage: item.heroImage,
              published: item.published,
              savedAt: new Date(item.savedAt),
              archived: item.archived,
              favorited: item.favorited,
              note: item.note,
              folderId,
              tags,
              highlights,
            })
            .onConflictDoNothing()
            .returning({ id: articles.id });
          if (inserted[0]) break;
          const dup = await tx
            .select({ id: articles.id })
            .from(articles)
            .where(
              and(
                eq(articles.userId, context.userId),
                eq(articles.canonicalUrl, item.canonicalUrl),
              ),
            )
            .limit(1);
          if (dup[0]) break;
        }
      }
    });

    await invalidateUserCache(context.userId);
    return loadSnapshot(context.userId);
  });
