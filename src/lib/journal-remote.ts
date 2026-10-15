import { journalApi } from "@/lib/api/journal";
import { isDateKey, useJournalStore, type JournalEntry } from "@/lib/journal";
import { createSyncQueue, localOnceFlag } from "@/lib/sync-queue";

const LOCAL_KEY = "quarto-journal";
const MIGRATED_FLAG = "quarto-journal-migrated-v1";

type JournalOp = { kind: "upsert"; entry: JournalEntry };

const queue = createSyncQueue<JournalOp>("journal", (op) => journalApi.upsert(op.entry));
const sync = queue.sync;
const legacyMigrated = localOnceFlag(MIGRATED_FLAG);

export function hydrateJournal(entries: Record<string, JournalEntry>) {
  useJournalStore.getState().replaceEntries(entries);
}

function parseEntry(value: unknown): JournalEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { date?: unknown; text?: unknown; updatedAt?: unknown };
  if (typeof row.date !== "string" || !isDateKey(row.date)) return null;
  if (typeof row.text !== "string") return null;
  const updatedAt =
    typeof row.updatedAt === "number" && Number.isFinite(row.updatedAt) ? row.updatedAt : 0;
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
    queue.start(userId);
    let remote = await journalApi.list();
    const local = readLocalEntries();
    const localList = Object.values(local);

    if (remote.length === 0 && localList.length > 0 && !legacyMigrated.isSet()) {
      remote = await journalApi.import(localList);
      legacyMigrated.set();
    } else if (!legacyMigrated.isSet()) {
      legacyMigrated.set();
    }

    const merged = mergeByUpdatedAt(local, remote);
    const remoteByDate = Object.fromEntries(remote.map((e) => [e.date, e]));
    for (const entry of Object.values(merged)) {
      const server = remoteByDate[entry.date];
      if (!server || entry.updatedAt > server.updatedAt) {
        sync("entry", {
          kind: "upsert",
          entry: { date: entry.date, text: entry.text, updatedAt: entry.updatedAt },
        });
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
  sync("entry", { kind: "upsert", entry: { date, text, updatedAt } });
}

export function clearJournalLocal() {
  bootedUserId = null;
  queue.stop();
  useJournalStore.getState().clearAll();
}
