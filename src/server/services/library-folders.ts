import "@tanstack/react-start/server-only";
import { and, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { LibrarySnapshot } from "@/lib/api/types";
import { invalidateUserCache } from "@/lib/cache.server.ts";
import { getDb } from "@/lib/db";
import { articles, folders } from "@/lib/schema";
import {
  LIBRARY_LIMITS as L,
  clampLibraryItem,
  normalizeTag,
  type Folder,
} from "@/lib/library-item";
import { uid } from "@/lib/id";
import { libraryItemSchema, loadSnapshot, sanitizeStoredHtml } from "@/lib/library-rows.server.ts";
import { conflict } from "@/server/http";

export const folderIdParams = z.object({ id: z.string().min(1).max(200) });

export const addFolderBody = z.object({
  id: z.string().min(1).max(200).optional(),
  name: z.string().trim().min(1).max(L.folderName),
});

export const renameFolderBody = z.object({ name: z.string().trim().min(1).max(L.folderName) });

export const importSnapshotBody = z.preprocess(
  (input) => {
    const raw =
      input && typeof input === "object"
        ? (input as { library?: unknown; folders?: unknown })
        : null;
    return {
      library: Array.isArray(raw?.library) ? raw.library.map(clampLibraryItem) : raw?.library,
      folders: raw?.folders,
    };
  },
  z.object({
    library: z.array(libraryItemSchema).max(200),
    folders: z
      .array(
        z.object({ id: z.string().min(1).max(200), name: z.string().min(1).max(L.folderName) }),
      )
      .max(L.folders),
  }),
);

/** Delete every article + folder owned by this user. Scoped by userId —
 *  nothing outside the caller's account is touched. */
export async function wipeLibrary(userId: string): Promise<void> {
  const db = await getDb();
  // One transaction: a failure part-way never leaves a half-wiped account.
  await db.transaction(async (tx) => {
    await tx.delete(articles).where(eq(articles.userId, userId));
    await tx.delete(folders).where(eq(folders.userId, userId));
  });
  await invalidateUserCache(userId);
}

export async function addLibraryFolder(
  userId: string,
  data: z.output<typeof addFolderBody>,
): Promise<Folder> {
  const db = await getDb();
  const name = data.name.trim().slice(0, L.folderName);
  const existing = await db
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(and(eq(folders.userId, userId), sql`lower(${folders.name}) = lower(${name})`))
    .limit(1);
  if (existing[0]) return { id: existing[0].id, name: existing[0].name };

  const [{ value: folderCount }] = await db
    .select({ value: count() })
    .from(folders)
    .where(eq(folders.userId, userId));
  if (Number(folderCount) >= L.folders) {
    throw conflict("Folder limit reached.");
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
      if (byId[0].userId === userId) return { id: byId[0].id, name: byId[0].name };
      id = uid();
    }
  }
  await db
    .insert(folders)
    .values({ id, userId: userId, name })
    .onConflictDoNothing({ target: folders.id });
  await invalidateUserCache(userId);
  // Confirm ownership (a concurrent insert winning the race returns its row
  // only when we own it; otherwise fall back to the name lookup above).
  const owned = await db
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, userId)))
    .limit(1);
  if (owned[0]) return { id: owned[0].id, name: owned[0].name };
  return { id, name };
}

export async function renameLibraryFolder(
  userId: string,
  id: string,
  data: z.output<typeof renameFolderBody>,
): Promise<void> {
  const db = await getDb();
  const name = data.name.trim().slice(0, L.folderName);
  await db
    .update(folders)
    .set({ name })
    .where(and(eq(folders.id, id), eq(folders.userId, userId)));
  await invalidateUserCache(userId);
}

export async function removeLibraryFolder(userId: string, id: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(articles)
      .set({ folderId: null })
      .where(and(eq(articles.userId, userId), eq(articles.folderId, id)));
    await tx.delete(folders).where(and(eq(folders.id, id), eq(folders.userId, userId)));
  });
  await invalidateUserCache(userId);
}

/** One-time import of a legacy local library — only when the account library is empty. */
export async function importLibrarySnapshot(
  userId: string,
  data: z.output<typeof importSnapshotBody>,
): Promise<LibrarySnapshot> {
  const db = await getDb();
  const [{ value: existingCount }] = await db
    .select({ value: count() })
    .from(articles)
    .where(eq(articles.userId, userId));

  // Only import local leftovers when the account library is empty.
  // (The tail of this handler invalidates + reloads after writing.)
  if (Number(existingCount) > 0) {
    return loadSnapshot(userId);
  }

  // Sanitize outside the transaction so it doesn't hold a connection.
  const items = data.library.slice(0, 200);
  const bodies = await Promise.all(
    items.map((item) => sanitizeStoredHtml(item.contentHtml, item.canonicalUrl || item.url)),
  );

  await db.transaction(async (tx) => {
    for (const folder of data.folders.slice(0, L.folders)) {
      // Remap ids already taken by another tenant so we never link to (or
      // silently collide with) a foreign folder row.
      const taken = await tx
        .select({ id: folders.id, userId: folders.userId })
        .from(folders)
        .where(eq(folders.id, folder.id))
        .limit(1);
      let folderId = folder.id;
      if (taken[0] && taken[0].userId !== userId) {
        folderId = uid();
        for (const item of data.library) {
          if (item.folderId === folder.id) item.folderId = folderId;
        }
      }
      await tx
        .insert(folders)
        .values({
          id: folderId,
          userId: userId,
          name: folder.name.trim().slice(0, L.folderName),
        })
        .onConflictDoNothing({ target: folders.id });
    }

    const ownedFolderIds = new Set(
      (await tx.select({ id: folders.id }).from(folders).where(eq(folders.userId, userId))).map(
        (f) => f.id,
      ),
    );

    for (const [index, item] of items.entries()) {
      const tags = item.tags.map(normalizeTag).filter(Boolean).slice(0, L.tags);
      const highlights = item.highlights.slice(0, L.highlights);
      const folderId = item.folderId && ownedFolderIds.has(item.folderId) ? item.folderId : null;
      const contentHtml = bodies[index]!;
      // An id owned by another user gets one retry with a fresh id; a
      // duplicate canonical URL within the import is skipped.
      for (const id of [item.id, uid()]) {
        const inserted = await tx
          .insert(articles)
          .values({
            id,
            userId: userId,
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
          .where(and(eq(articles.userId, userId), eq(articles.canonicalUrl, item.canonicalUrl)))
          .limit(1);
        if (dup[0]) break;
      }
    }
  });

  await invalidateUserCache(userId);
  return loadSnapshot(userId);
}
