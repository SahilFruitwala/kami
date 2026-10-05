import { useMemo, useState } from "react";
import { toast } from "sonner";
import { libraryApi } from "@/lib/api/library";
import { useLibraryStore } from "@/lib/store.ts";
import { parseBulkUrls } from "@/lib/session-article.ts";

export const MAX_BULK_URLS = 50;

/** URLs per request — extraction makes each call slower than a plain save,
//  so large pastes go out in chunks with progress between them. */
const BULK_CHUNK = 10;

export function useBulkSave() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const urls = useMemo(() => parseBulkUrls(draft).slice(0, MAX_BULK_URLS), [draft]);
  const overflow = useMemo(() => parseBulkUrls(draft).length > MAX_BULK_URLS, [draft]);

  function reset() {
    setDraft("");
    setProgress({ done: 0, total: 0 });
  }

  async function saveAll() {
    if (urls.length === 0) {
      toast.error("Paste at least one link first.");
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: urls.length });
    let savedCount = 0;
    let skippedCount = 0;
    let invalidCount = 0;
    let firstError = "";
    try {
      for (let i = 0; i < urls.length; i += BULK_CHUNK) {
        const chunk = urls.slice(i, i + BULK_CHUNK);
        const result = await libraryApi.bulkSave(chunk);
        const store = useLibraryStore.getState();
        for (const item of result.saved) {
          store.upsertItem(item, { sync: false });
        }
        savedCount += result.saved.length;
        skippedCount += result.skipped.length;
        invalidCount += result.errors.length;
        if (!firstError && result.errors[0]) firstError = result.errors[0].error;
        setProgress({ done: Math.min(i + BULK_CHUNK, urls.length), total: urls.length });
      }
      const parts: string[] = [];
      if (savedCount > 0) parts.push(`Saved ${savedCount}`);
      if (skippedCount > 0) parts.push(`${skippedCount} already in library`);
      if (invalidCount > 0) parts.push(`${invalidCount} invalid`);
      if (savedCount > 0) {
        toast.success(parts.join(" · "));
        setOpen(false);
        reset();
      } else if (skippedCount > 0 && invalidCount === 0) {
        toast.message("Those links are already in your library.");
      } else {
        toast.error(firstError || "Could not save those links.");
      }
    } catch (err) {
      console.error("[bulk-save] failed:", err);
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        toast.error("You're offline — reconnect to bulk save links.");
      } else if (savedCount > 0) {
        toast.success(`Saved ${savedCount} before the connection dropped — retry for the rest.`);
        setOpen(false);
        reset();
      } else {
        toast.error(err instanceof Error ? err.message : "Could not save those links.");
      }
    } finally {
      setBusy(false);
    }
  }

  return {
    open,
    setOpen,
    draft,
    setDraft,
    busy,
    progress,
    urls,
    overflow,
    saveAll,
  };
}
