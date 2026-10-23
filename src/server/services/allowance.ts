import "@tanstack/react-start/server-only";
import type { AllowanceView } from "@/lib/api/narration";
import { summarizeAllowance } from "@/lib/allowance.ts";
import { allowanceBalance, recentAllowanceEntries } from "@/lib/allowance-db.server.ts";
import { getDb } from "@/lib/db.server";
import { narrationConfigured } from "@/lib/narration-config.server.ts";

/** What the Listening card shows: the caller's own allowance, never the Deepgram balance. */
export async function getAllowance(userId: string): Promise<AllowanceView> {
  if (!narrationConfigured()) return { enabled: false, available: 0, reserved: 0, entries: [] };
  const db = await getDb();
  const [available, entries] = await Promise.all([
    allowanceBalance(db, userId),
    recentAllowanceEntries(db, userId, 20),
  ]);
  return {
    enabled: true,
    ...summarizeAllowance([{ chars: available }], []),
    entries,
  };
}
