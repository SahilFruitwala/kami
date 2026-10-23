import { AwsClient } from "aws4fetch";
import type { ObjectStore } from "./object-store.ts";

/**
 * Cloudflare R2 over its S3 API, signed with aws4fetch (small, fetch-based;
 * the full AWS SDK is megabytes and its default checksums have broken R2).
 * Only PUT, GET, DELETE and presigned GET are needed: parts are joined in
 * memory, never with multipart (R2 requires ≥ 5 MiB equal-size parts).
 * Presigned URLs work only on the account's S3 host, not custom domains.
 * Tested in scripts/narration-io.test.mjs.
 */

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

/** The account's S3 API host, which the CSP must allow for `<audio>`. */
export const r2Host = (accountId: string) => `${accountId}.r2.cloudflarestorage.com`;

/** The URL of one object, each key segment encoded and slashes kept. */
export function r2ObjectUrl(cfg: Pick<R2Config, "accountId" | "bucket">, key: string): string {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `https://${r2Host(cfg.accountId)}/${encodeURIComponent(cfg.bucket)}/${path}`;
}

/** Presigned URLs may live at most seven days. */
export const MAX_PRESIGN_SECONDS = 7 * 24 * 60 * 60;

export function createR2Store(cfg: R2Config, fetchImpl: typeof fetch = fetch): ObjectStore {
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const send = async (key: string, init: RequestInit) => {
    const signed = await client.sign(r2ObjectUrl(cfg, key), init);
    return fetchImpl(signed);
  };
  const fail = async (op: string, key: string, res: Response) => {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    return new Error(`R2 ${op} ${key} failed: ${res.status} ${detail}`.trim());
  };

  return {
    async put(key, body, contentType) {
      const res = await send(key, {
        method: "PUT",
        body: body as BodyInit,
        headers: { "content-type": contentType, "content-length": String(body.byteLength) },
      });
      if (!res.ok) throw await fail("PUT", key, res);
    },
    async get(key) {
      const res = await send(key, { method: "GET" });
      if (res.status === 404) return null;
      if (!res.ok) throw await fail("GET", key, res);
      return new Uint8Array(await res.arrayBuffer());
    },
    async delete(key) {
      const res = await send(key, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw await fail("DELETE", key, res);
    },
    async presignGet(key, expiresSeconds) {
      const seconds = Math.max(1, Math.min(MAX_PRESIGN_SECONDS, Math.round(expiresSeconds)));
      const url = new URL(r2ObjectUrl(cfg, key));
      url.searchParams.set("X-Amz-Expires", String(seconds));
      const signed = await client.sign(url.toString(), {
        method: "GET",
        aws: { signQuery: true },
      });
      return signed.url;
    },
  };
}
