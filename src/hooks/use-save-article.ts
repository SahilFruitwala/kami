import { useRef, useState } from "react";
import { toast } from "sonner";
import { useOrganizeAfterSave } from "@/hooks/use-ai.ts";
import { libraryApi } from "@/lib/api/library";
import type { SaveUrlResult } from "@/lib/api/types";
import { normalizeSourceUrl, writeDraftUrl } from "@/lib/session-article.ts";
import { useLibraryStore } from "@/lib/store.ts";

export function useSaveArticle(goOpen: (id: string | null, replace?: boolean) => void) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef<string | null>(null);
  const organizeAfterSave = useOrganizeAfterSave();

  /**
   * The server fetched, extracted and stored the work (`/api/library/save`),
   * so the returned row is canonical — `/read?id=` resolves, refresh or not.
   */
  function acceptResult(result: SaveUrlResult, thenOpen: boolean) {
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    useLibraryStore.getState().upsertItem(result.item, { sync: false });
    writeDraftUrl("");
    setUrl("");
    setError("");
    organizeAfterSave();
    if (!thenOpen) goOpen(null, true);
    else {
      goOpen(result.item.id);
      toast.success(result.existed ? "Already in your list" : "Saved to your list");
    }
    return true;
  }

  function failureMessage(fallback: string): string {
    return typeof navigator !== "undefined" && navigator.onLine === false
      ? "You're offline — connect and try again."
      : fallback;
  }

  async function save(nextUrl = url, thenOpen = true) {
    const trimmed = normalizeSourceUrl(nextUrl);
    if (!trimmed) {
      setError("Paste a blog or X URL first.");
      return;
    }
    if (inFlight.current === trimmed && busy) return;
    setUrl(trimmed);
    writeDraftUrl(trimmed);
    inFlight.current = trimmed;
    setBusy(true);
    setError("");
    try {
      const result = await libraryApi.saveUrl(trimmed);
      if (inFlight.current !== trimmed) return;
      acceptResult(result, thenOpen);
    } catch (err) {
      if (inFlight.current !== trimmed) return;
      console.error("[save-article] save failed:", err);
      setError(failureMessage("Something went wrong while reading that page. Try again."));
    } finally {
      if (inFlight.current === trimmed) {
        inFlight.current = null;
        setBusy(false);
      }
    }
  }

  async function saveLinkOnly() {
    const trimmed = normalizeSourceUrl(url);
    if (!trimmed) {
      setError("Paste a URL first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      acceptResult(await libraryApi.saveUrl(trimmed, { linkOnly: true }), true);
    } catch {
      setError(failureMessage("Could not save that link."));
    } finally {
      setBusy(false);
    }
  }

  return {
    url,
    setUrl,
    busy,
    setBusy,
    error,
    setError,
    save,
    saveLinkOnly,
  };
}
