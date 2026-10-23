import type { ArticleSummary } from "@/lib/api/ai";

/** What a Gist stores in `article_ai.summary`; the rest is derived on read. */
export type StoredGist = Pick<ArticleSummary, "tldr" | "keyPoints" | "folderId" | "clipped">;

/** At most this many key points survive, whatever the model returns. */
export const MAX_KEY_POINTS = 6;

/**
 * Turn the model's raw answer into a stored Gist: trimmed text, no empty key
 * points, at most six of them, and the suggested folder resolved to one of
 * the user's own folders by name (case-insensitive) or null.
 */
export function shapeGist(
  output: { tldr: string; keyPoints: string[]; folder: string | null },
  folders: Array<{ id: string; name: string }>,
  clipped: boolean,
): StoredGist {
  const folderName = output.folder?.trim().toLowerCase();
  const folder = folderName
    ? folders.find((f) => f.name.trim().toLowerCase() === folderName)
    : undefined;
  return {
    tldr: output.tldr.trim(),
    keyPoints: output.keyPoints
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, MAX_KEY_POINTS),
    folderId: folder?.id ?? null,
    clipped,
  };
}

/**
 * Read a stored Gist, including rows written before `clipped` existed and
 * rows that still carry the retired `tags` field.
 */
export function readStoredGist(stored: unknown): StoredGist {
  const row = (stored ?? {}) as Partial<StoredGist>;
  return {
    tldr: typeof row.tldr === "string" ? row.tldr : "",
    keyPoints: Array.isArray(row.keyPoints) ? row.keyPoints : [],
    folderId: typeof row.folderId === "string" ? row.folderId : null,
    clipped: row.clipped === true,
  };
}
