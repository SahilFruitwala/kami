import { useState } from "react";
import { toast } from "sonner";
import { articlesApi } from "@/lib/api/articles";
import { persistArticleItem } from "@/lib/library-remote.ts";
import { articleToItem } from "@/lib/library-item.ts";

export function usePasteImport(goOpen: (id: string | null, replace?: boolean) => void) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");
  const [busy, setBusy] = useState(false);

  function resetPaste() {
    setPasteTitle("");
    setPasteBody("");
    setPasteUrl("");
  }

  function seedPaste(payload: { title: string; url: string; html: string }) {
    setPasteOpen(true);
    setPasteTitle(payload.title);
    setPasteUrl(payload.url);
    setPasteBody(payload.html);
  }

  async function importPasted() {
    if (!pasteTitle.trim() || !pasteBody.trim()) {
      toast.error("Add a title and the article text.");
      return;
    }
    setBusy(true);
    try {
      const looksHtml = /<\/?[a-z][\s\S]*>/i.test(pasteBody);
      const result = await articlesApi.import({
        url: pasteUrl.trim() || undefined,
        title: pasteTitle.trim(),
        contentHtml: looksHtml ? pasteBody : undefined,
        contentText: looksHtml ? undefined : pasteBody,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const item = articleToItem(result.article);
      try {
        const saved = await persistArticleItem(item);
        goOpen(saved.id);
        setPasteOpen(false);
        resetPaste();
        toast.success("Imported article");
      } catch (err) {
        console.error("[paste-import] persist failed:", err);
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          goOpen(item.id);
          setPasteOpen(false);
          resetPaste();
          toast.success("Saved here — will sync when back online");
        } else {
          toast.error(err instanceof Error ? err.message : "Import failed. Try again.");
        }
      }
    } catch {
      toast.error("Import failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return {
    pasteOpen,
    setPasteOpen,
    pasteTitle,
    setPasteTitle,
    pasteBody,
    setPasteBody,
    pasteUrl,
    setPasteUrl,
    busy,
    importPasted,
    seedPaste,
  };
}
