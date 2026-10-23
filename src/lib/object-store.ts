/**
 * Where narration audio lives. The R2 implementation is in r2.server.ts; the
 * in-memory one backs tests. Keys are predictable so cleanup never needs to
 * list the bucket. Access is enforced by the narration API (owner checks),
 * never by key secrecy.
 */

export type ObjectStore = {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** The object's bytes, or null when it doesn't exist. */
  get(key: string): Promise<Uint8Array | null>;
  /** Deleting a missing object is not an error. */
  delete(key: string): Promise<void>;
  /** A time-limited URL that plays the object directly. */
  presignGet(key: string, expiresSeconds: number): Promise<string>;
};

export const AUDIO_CONTENT_TYPE = "audio/mpeg";

/** Object keys for one narration: its parts while it runs, then one file. */
export function narrationKeys(userId: string, articleId: string, narrationId: string) {
  const base = `narrations/${encodeURIComponent(userId)}/${encodeURIComponent(articleId)}/${narrationId}`;
  return {
    part: (index: number) => `${base}/part-${String(index + 1).padStart(4, "0")}.mp3`,
    audio: `${base}/narration.mp3`,
  };
}

/** An in-memory ObjectStore for tests. */
export function memoryObjectStore(): ObjectStore & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(key, body) {
      objects.set(key, body.slice());
    },
    async get(key) {
      return objects.get(key)?.slice() ?? null;
    },
    async delete(key) {
      objects.delete(key);
    },
    async presignGet(key, expiresSeconds) {
      return `memory://${key}?expires=${expiresSeconds}`;
    },
  };
}
