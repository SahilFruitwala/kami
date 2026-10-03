import { useMemo } from "react";
import { useLibraryStore } from "@/lib/store.ts";

/** Desk-wide counts shared by the header, home, and footer. */
export function useDeskStats() {
  const library = useLibraryStore((s) => s.library);
  return useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    return {
      total: library.length,
      inbox: library.filter((row) => !row.archived).length,
      archived: library.filter((row) => row.archived).length,
      vaultCount: library.reduce((n, row) => n + (row.highlights?.length ?? 0), 0),
      minutesToday: library
        .filter((row) => row.savedAt >= startMs)
        .reduce((n, row) => n + (row.readingMinutes || 0), 0),
    };
  }, [library]);
}
