/**
 * Fire-and-forget server writes with an in-memory retry outbox, shared by the
 * library and journal sync layers (`*-remote.ts`).
 *
 * A write runs immediately when online; if it fails (or the browser is
 * offline) it is queued and retried on reconnect or via `flushAllSyncQueues`
 * (the offline pill's Retry). The queue lives in memory, so writes still
 * queued when the tab closes are lost — persisting them needs serializable
 * ops instead of closures.
 */

type Entry = { id: number; label: string; run: () => Promise<unknown> };
type Listener = (count: number) => void;

export type FlushResult = { done: number; failed: number };

export type SyncQueue = {
  /** Writes are dropped while disabled (signed out / before boot). */
  setEnabled: (enabled: boolean) => void;
  /** Run `task` now, queueing it for retry on failure or while offline. */
  sync: (label: string, task: () => Promise<unknown>) => void;
  /** Retry every queued write in order; failures stay queued. */
  flush: () => Promise<FlushResult>;
  pending: () => number;
};

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

export function createSyncQueue(name: string): SyncQueue {
  let enabled = false;
  let seq = 0;
  const outbox: Entry[] = [];

  const enqueue = (label: string, run: Entry["run"]) => {
    outbox.push({ id: ++seq, label, run });
    notify();
  };

  const queue: SyncQueue = {
    setEnabled: (next) => {
      enabled = next;
    },
    sync: (label, task) => {
      if (!enabled) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        enqueue(label, task);
        return;
      }
      void task().catch((err) => {
        console.error(`[${name}]`, err);
        enqueue(label, task);
      });
    },
    flush: async () => {
      let done = 0;
      const failed: Entry[] = [];
      for (const entry of outbox.splice(0)) {
        try {
          await entry.run();
          done += 1;
        } catch (err) {
          console.error(`[${name}]`, err);
          failed.push(entry);
        }
      }
      outbox.unshift(...failed);
      notify();
      return { done, failed: failed.length };
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
    set: () => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    },
  };
}
