import "@tanstack/react-start/server-only";
import { waitUntil } from "@vercel/functions";

/**
 * Keep `work` running after the response is sent. On Vercel the platform
 * keeps the function alive for it (within the function's maxDuration); in
 * local dev there is no request context, so the promise simply runs on in
 * the long-lived dev server. Errors are logged, never thrown at the caller.
 */
export function runInBackground(label: string, work: () => Promise<unknown>): void {
  const task = Promise.resolve()
    .then(work)
    .catch((err) => console.error(`[${label}]`, err));
  waitUntil(task);
}
