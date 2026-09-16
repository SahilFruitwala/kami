import {
  getJournalEntries,
  importJournalSnapshot,
  upsertJournalEntry,
} from "@/lib/journal-fns";
import {
  isDateKey,
  useJournalStore,
  type JournalEntry,
} from "@/lib/journal";

const LOCAL_KEY = "quarto-journal";
const MIGRATED_FLAG = "quarto-journal-migrated-v1";

let remoteEnabled = false;

export function setJournalRemoteEnabled(enabled: boolean) {
  remoteEnabled = enabled;
}

type OutboxEntry = { id: number; label: string; run: () => Promise<unknown> };

let outboxSeq = 0;
const outbox: OutboxEntry[] = [];
const outboxListeners = new Set<(count: number) => void>();

function notifyOutbox() {
  for (const fn of outboxListeners) fn(outbox.length);
}

export function subscribeJournalOutbox(fn: (count: number) => void): () => void {
  outboxListeners.add(fn);
  fn(outbox.length);
  return () => {
    outboxListeners.delete(fn);
  };
}

export function pendingJournalSyncCount(): number {
  return outbox.length;
}

function enqueue(entry: Omit<OutboxEntry, "id">) {
  outbox.push({ ...entry, id: ++outboxSeq });
  notifyOutbox();
}

function sync(label: string, task: () => Promise<unknown>) {
  if (!remoteEnabled) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    enqueue({ label, run: task });
    return;
  }
  void task().catch((err) => {
    console.error("[journal]", err);
    enqueue({ label, run: task });
  });
}

export async function flushJournalOutbox(): Promise<{ done: number; failed: number }> {
  let done = 0;
  const failed: OutboxEntry[] = [];
  for (const entry of outbox.splice(0)) {
    try {
      await entry.run();
      done += 1;
    } catch (err) {
      console.error("[journal]", err);
      failed.push(entry);
    }
  }
  outbox.unshift(...failed);
  notifyOutbox();
  return { done, failed: failed.length };
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void flushJournalOutbox();
  });
}

export function hydrateJournal(entries: Record<string, JournalEntry>) {
  useJournalStore.getState().replaceEntries(entries);
}

function parseEntry(value: unknown): JournalEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { date?: unknown; text?: unknown; updatedAt?: unknown };
  if (typeof row.date !== "string" || !isDateKey(row.date)) return null;
  if (typeof row.text !== "string") return null;
  const updatedAt =
    typeof row.updatedAt === "number" && Number.isFinite(row.updatedAt)
      ? row.updatedAt
      : 0;
  return { date: row.date, text: row.text, updatedAt };
}

function readLocalEntries(): Record<string, JournalEntry> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { state?: { entries?: unknown } };
    const source = parsed.state?.entries;
    if (!source || typeof source !== "object") return {};
    const entries: Record<string, JournalEntry> = {};
    for (const value of Object.values(source as Record<string, unknown>)) {
      const entry = parseEntry(value);
      if (entry) entries[entry.date] = entry;
    }
    return entries;
  } catch {
    return {};
  }
}

function markLegacyMigrated() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MIGRATED_FLAG, "1");
  } catch {
    /* ignore */
  }
}

function wasLegacyMigrated(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(MIGRATED_FLAG) === "1";
  } catch {
    return true;
  }
}

function mergeByUpdatedAt(
  local: Record<string, JournalEntry>,
  remote: JournalEntry[],
): Record<string, JournalEntry> {
  const merged: Record<string, JournalEntry> = { ...local };
  for (const entry of remote) {
    const current = merged[entry.date];
    if (!current || entry.updatedAt >= current.updatedAt) {
      merged[entry.date] = entry;
    }
  }
  return merged;
}

export function isJournalBootstrapped(userId: string): boolean {
  return bootedUserId === userId;
}

let bootedUserId: string | null = null;
let bootInflight: Promise<void> | null = null;

export async function bootstrapJournalFromServer(userId: string): Promise<void> {
  if (bootedUserId === userId) return;
  if (bootInflight) {
    await bootInflight;
    return;
  }
  bootInflight = (async () => {
    setJournalRemoteEnabled(true);
    let remote = await getJournalEntries();
    const local = readLocalEntries();
    const localList = Object.values(local);

    if (remote.length === 0 && localList.length > 0 && !wasLegacyMigrated()) {
      remote = await importJournalSnapshot({ data: { entries: localList } });
      markLegacyMigrated();
    } else if (!wasLegacyMigrated()) {
      markLegacyMigrated();
    }

    const merged = mergeByUpdatedAt(local, remote);
    const remoteByDate = Object.fromEntries(remote.map((e) => [e.date, e]));
    for (const entry of Object.values(merged)) {
      const server = remoteByDate[entry.date];
      if (!server || entry.updatedAt > server.updatedAt) {
        sync("entry", () =>
          upsertJournalEntry({
            data: {
              date: entry.date,
              text: entry.text,
              updatedAt: entry.updatedAt,
            },
          }),
        );
      }
    }

    hydrateJournal(merged);
    bootedUserId = userId;
  })();
  try {
    await bootInflight;
  } finally {
    bootInflight = null;
  }
}

export function syncUpsertEntry(date: string, text: string, updatedAt: number) {
  sync("entry", () => upsertJournalEntry({ data: { date, text, updatedAt } }));
}

export function clearJournalLocal() {
  bootedUserId = null;
  setJournalRemoteEnabled(false);
  useJournalStore.getState().clearAll();
}
