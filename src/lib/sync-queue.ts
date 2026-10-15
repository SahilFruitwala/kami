/**
 * Fire-and-forget server writes with a retry outbox, shared by the library and
 * journal sync layers (`*-remote.ts`).
 *
 * A write is a plain-data op (e.g. `{ kind: "patch", id, patch }`) run by the
 * queue's `run` function. It runs immediately when online; if it fails (or the
 * browser is offline) it is queued and retried on reconnect, on the next boot,
 * or via `flushAllSyncQueues` (the offline pill's Retry).
 *
 * Queued ops are saved to localStorage under the signed-in user's id, so they
 * survive a reload and are only ever replayed for that same user. Ops older
 * than `MAX_AGE_MS` are dropped on load rather than replayed over newer edits.
 */

import { readLocal, writeLocal } from "@/lib/local-pref";

type Entry<Op> = { label: string; op: Op; at: number };
type Listener = (count: number) => void;

export type FlushResult = { done: number; failed: number };

export type SyncQueue<Op> = {
  /** Load and replay `userId`'s saved ops; accept new writes. */
  start: (userId: string) => void;
  /** Stop accepting writes (sign-out). Saved ops stay for that user's next boot. */
  stop: () => void;
  /** Run `op` now, queueing it for retry on failure or while offline. */
  sync: (label: string, op: Op) => void;
  /** Retry every queued op in order; failures stay queued. */
  flush: () => Promise<FlushResult>;
  /** Drop the current user's queued ops (their data was just wiped). */
  discard: () => void;
  pending: () => number;
};

const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

const queues = new Set<{ pending: () => number; flush: () => Promise<FlushResult> }>();
const listeners = new Set<Listener>();

function totalPending(): number {
  let total = 0;
  for (const q of queues) total += q.pending();
  return total;
}

function notify() {
  const count = totalPending();
  for (const fn of listeners) fn(count);
}

export function createSyncQueue<Op>(
  name: string,
  run: (op: Op) => Promise<unknown>,
  opts: {
    /** Smaller copy of an op to save when storage is full (e.g. drop an article body). */
    shrink?: (op: Op) => Op;
  } = {},
): SyncQueue<Op> {
  let userId: string | null = null;
  let outbox: Entry<Op>[] = [];

  const storageKey = (id: string) => `kami-outbox:${name}:${id}`;

  function save() {
    if (!userId) return;
    const key = storageKey(userId);
    if (outbox.length === 0) {
      writeLocal(key, null);
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(outbox));
    } catch {
      // Quota: try a slimmer copy; failing that the ops stay in memory only.
      if (!opts.shrink) return;
      const slim = outbox.map((e) => ({ ...e, op: opts.shrink!(e.op) }));
      writeLocal(key, JSON.stringify(slim));
    }
  }

  function load(id: string): Entry<Op>[] {
    try {
      const parsed: unknown = JSON.parse(readLocal(storageKey(id)) ?? "[]");
      if (!Array.isArray(parsed)) return [];
      const cutoff = Date.now() - MAX_AGE_MS;
      return (parsed as Entry<Op>[]).filter(
        (e) => e && typeof e.label === "string" && typeof e.at === "number" && e.at >= cutoff,
      );
    } catch {
      return [];
    }
  }

  function enqueue(label: string, op: Op) {
    outbox.push({ label, op, at: Date.now() });
    save();
    notify();
  }

  const queue: SyncQueue<Op> = {
    start: (id) => {
      if (userId === id) return;
      userId = id;
      outbox = load(id);
      notify();
      if (outbox.length && (typeof navigator === "undefined" || navigator.onLine !== false)) {
        void queue.flush();
      }
    },
    stop: () => {
      userId = null;
      outbox = [];
      notify();
    },
    sync: (label, op) => {
      if (!userId) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        enqueue(label, op);
        return;
      }
      const owner = userId;
      void run(op).catch((err) => {
        console.error(`[${name}]`, err);
        if (userId === owner) enqueue(label, op);
      });
    },
    flush: async () => {
      const owner = userId;
      let done = 0;
      const failed: Entry<Op>[] = [];
      for (const entry of outbox.splice(0)) {
        try {
          await run(entry.op);
          done += 1;
        } catch (err) {
          console.error(`[${name}]`, err);
          failed.push(entry);
        }
      }
      // Signed out (or switched user) mid-flush: the new session owns the outbox.
      if (userId === owner) {
        outbox.unshift(...failed);
        save();
      }
      notify();
      return { done, failed: failed.length };
    },
    discard: () => {
      outbox = [];
      save();
      notify();
    },
    pending: () => outbox.length,
  };
  queues.add(queue);
  return queue;
}

/** Pending writes across every queue. */
export function pendingSyncCount(): number {
  return totalPending();
}

/** Subscribe to the total pending count. Called immediately with the current value. */
export function subscribeSyncQueues(fn: Listener): () => void {
  listeners.add(fn);
  fn(totalPending());
  return () => {
    listeners.delete(fn);
  };
}

/** Retry every queue's pending writes. */
export async function flushAllSyncQueues(): Promise<FlushResult> {
  const results = await Promise.all([...queues].map((q) => q.flush()));
  return results.reduce((a, b) => ({ done: a.done + b.done, failed: a.failed + b.failed }), {
    done: 0,
    failed: 0,
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void flushAllSyncQueues();
  });
}

/**
 * A one-way "done" flag in localStorage (e.g. a one-time legacy import).
 * Unreadable storage counts as done so a blocked import is never retried
 * on every boot.
 */
export function localOnceFlag(key: string): { isSet: () => boolean; set: () => void } {
  return {
    isSet: () => {
      if (typeof window === "undefined") return true;
      try {
        return window.localStorage.getItem(key) === "1";
      } catch {
        return true;
      }
    },
    set: () => writeLocal(key, "1"),
  };
}
