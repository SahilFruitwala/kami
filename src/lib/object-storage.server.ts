import "@tanstack/react-start/server-only";
import { AwsClient } from "aws4fetch";

/**
 * S3-compatible object storage (Cloudflare R2, AWS S3, MinIO, …) used to keep
 * our own copy of the images in saved articles, so they survive the original
 * site going away. Optional: without the env vars below, `getObjectStorage()`
 * returns null and callers keep the original image URLs.
 *
 *   S3_ENDPOINT           e.g. https://<account>.r2.cloudflarestorage.com
 *   S3_BUCKET
 *   S3_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY
 *   S3_REGION             optional, default "auto" (R2); use e.g. "us-east-1" for S3
 */

export type ObjectStorage = {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; contentType: string } | null>;
};

let cachedStorage: ObjectStorage | null | undefined;

export function getObjectStorage(): ObjectStorage | null {
  if (cachedStorage !== undefined) return cachedStorage;
  const endpoint = process.env.S3_ENDPOINT?.trim().replace(/\/+$/, "");
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    cachedStorage = null;
    return null;
  }
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: process.env.S3_REGION?.trim() || "auto",
  });
  // Path-style URLs work for R2, S3 and MinIO alike.
  const urlFor = (key: string) =>
    `${endpoint}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

  cachedStorage = {
    async put(key, body, contentType) {
      const res = await client.fetch(urlFor(key), {
        method: "PUT",
        body: body as BodyInit,
        headers: { "content-type": contentType },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        await res.arrayBuffer().catch(() => undefined);
        throw new Error(`object storage PUT failed: ${res.status}`);
      }
    },
    async get(key) {
      const res = await client.fetch(urlFor(key), {
        method: "GET",
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 404 || res.status === 403) {
        await res.arrayBuffer().catch(() => undefined);
        return null;
      }
      if (!res.ok || !res.body) {
        await res.arrayBuffer().catch(() => undefined);
        throw new Error(`object storage GET failed: ${res.status}`);
      }
      return {
        body: res.body,
        contentType: res.headers.get("content-type") || "application/octet-stream",
      };
    },
  };
  return cachedStorage;
}
