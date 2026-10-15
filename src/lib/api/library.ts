import type { HighlightOp, TagOp } from "@/lib/item-ops";
import type { Folder, Highlight, LibraryItem } from "@/lib/library-item";
import { http, orNull, seg } from "./client";
import {
  LIBRARY_BOOT_LIMIT,
  type BulkSaveLinksResult,
  type LibraryCursor,
  type LibraryPage,
  type LibrarySnapshot,
  type SaveUrlResult,
} from "./types";

export type LibraryItemPatch = {
  archived?: boolean;
  favorited?: boolean;
  note?: string;
  folderId?: string | null;
  tags?: string[];
  highlights?: Highlight[];
  tagOps?: TagOp[];
  highlightOps?: HighlightOp[];
};

export const libraryApi = {
  /** One keyset page, newest first. The first page (no cursor) also carries folders + total. */
  page: ({
    limit = LIBRARY_BOOT_LIMIT,
    cursor,
  }: { limit?: number; cursor?: LibraryCursor | null } = {}) =>
    http.get<LibraryPage>("/api/library", {
      limit,
      cursorSavedAt: cursor?.savedAt,
      cursorId: cursor?.id,
    }),

  /** Full library including article bodies (JSON export). */
  export: () => http.get<LibrarySnapshot>("/api/library/export"),

  /** One-time import of a legacy local library; a no-op when the account isn't empty. */
  import: (snapshot: LibrarySnapshot) =>
    http.post<LibrarySnapshot>("/api/library/import", snapshot),

  /** Delete every article and folder on the account. */
  wipe: () => http.delete<void>("/api/library"),

  /** Fetch, extract and store one link server-side (existing saves are returned as-is). */
  saveUrl: (url: string, opts: { linkOnly?: boolean } = {}) =>
    http.post<SaveUrlResult>("/api/library/save", { url, linkOnly: opts.linkOnly }),

  /** Extract + save up to 50 links in one go. */
  bulkSave: (urls: string[]) => http.post<BulkSaveLinksResult>("/api/library/bulk", { urls }),

  items: {
    /** Article with body, or null when missing / not yours. */
    get: (id: string) => orNull(http.get<LibraryItem>(`/api/library/items/${seg(id)}`)),

    /** Insert or update by id / canonical URL / URL — the returned id may differ. */
    upsert: (item: LibraryItem) => http.post<LibraryItem>("/api/library/items", item),

    /** Partial update; null when the work no longer exists. */
    patch: (id: string, patch: LibraryItemPatch) =>
      orNull(http.patch<LibraryItem>(`/api/library/items/${seg(id)}`, patch)),

    remove: (id: string) => http.delete<void>(`/api/library/items/${seg(id)}`),
  },

  folders: {
    add: (folder: { id?: string; name: string }) =>
      http.post<Folder>("/api/library/folders", folder),
    rename: (id: string, name: string) =>
      http.patch<void>(`/api/library/folders/${seg(id)}`, { name }),
    remove: (id: string) => http.delete<void>(`/api/library/folders/${seg(id)}`),
  },
};
