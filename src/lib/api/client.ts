/**
 * Minimal typed fetch client for the app's `/api/*` routes.
 *
 * - Same-origin only; Clerk's session cookie rides along automatically.
 * - JSON in, JSON out; a 204 resolves to `undefined`.
 * - Non-2xx responses throw `ApiError` whose `message` is the server's
 *   user-facing `{ error }` text, so callers can toast `err.message` as-is.
 *   The 401 message is the stable string `"Unauthorized"`.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(err: unknown, status?: number): err is ApiError {
  return err instanceof ApiError && (status === undefined || err.status === status);
}

type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

type RequestOptions = {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const hasBody = opts.body !== undefined;
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(hasBody ? { "content-type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as T;

  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request failed (${res.status}).`;
    throw new ApiError(res.status, message);
  }
  return payload as T;
}

/** Encode one dynamic path segment. */
export const seg = (value: string | number) => encodeURIComponent(String(value));

export const http = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request<T>("GET", path, { query, signal }),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, { body }),
  put: <T>(path: string, body: unknown = {}) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body: unknown = {}) => request<T>("PATCH", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/** Resolve a 404 to `null` (owner-scoped reads where "missing" and "not yours" look the same). */
export async function orNull<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (isApiError(err, 404)) return null;
    throw err;
  }
}
