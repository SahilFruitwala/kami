import { useRef, useState } from "react";
import { toast } from "sonner";
import { extractArticle, saveLinkArticle } from "@/lib/article-fns.ts";
import { persistArticleItem } from "@/lib/library-remote.ts";
import { normalizeSourceUrl, writeDraftUrl } from "@/lib/session-article.ts";
import { articleToItem } from "@/lib/store.ts";
import type { ExtractResult } from "@/lib/article-types.ts";

export function useSaveArticle(goOpen: (id: string | null, replace?: boolean) => void) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef<string | null>(null);

  /**
   * Optimistic save with server confirmation: the row is in the store
   * instantly, then reconciled with the canonical server row before opening
   * the reader — so `/read?id=` always resolves, including after refresh.
   */
  async function acceptResult(result: ExtractResult, thenOpen: boolean) {
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    const item = articleToItem(result.article);
    writeDraftUrl("");
    setUrl("");
    setError("");
    try {
      const saved = await persistArticleItem(item);
      if (!thenOpen) goOpen(null, true);
      else {
        goOpen(saved.id);
        toast.success("Saved to your list");
      }
    } catch (err) {
      // Online failure: surface the real reason inline (and in the console)
      // instead of opening a reader for a row the next refresh can't see.
      // The outbox keeps one retry queued for transient/network failures.
      console.error("[save-article] persist failed:", err);
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!thenOpen) goOpen(null, true);
        else {
          goOpen(item.id);
          toast.success("Saved here — will sync when back online");
        }
        return true;
      }
      setError(err instanceof Error ? err.message : "Could not save that article.");
      return false;
    }
    return true;
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
      const result = await extractArticle({ data: { url: trimmed } });
      if (inFlight.current !== trimmed) return;
      await acceptResult(result, thenOpen);
    } catch {
      if (inFlight.current !== trimmed) return;
      setError("Something went wrong while reading that page. Try again.");
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
      const result = await saveLinkArticle({ data: { url: trimmed } });
      await acceptResult(result, true);
    } catch {
      setError("Could not save that link.");
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
