import { useEffect, useRef, useState } from "react";
import { selectionMenu, type SelMenu } from "@/lib/selection-menu.ts";
import { useLibraryStore } from "@/lib/store.ts";

export function useReaderProgress(canonicalUrl: string, itemId?: string) {
  const [progress, setProgressState] = useState(0);
  const lastPersist = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const next = max <= 0 ? 0 : Math.min(1, el.scrollTop / max);
      setProgressState(next);
      if (itemId) {
        const now = Date.now();
        if (now - lastPersist.current > 500 || next >= 0.99) {
          lastPersist.current = now;
          try {
            useLibraryStore.getState().setProgress(itemId, next);
          } catch {
            // store unavailable — ignore
          }
        }
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [canonicalUrl, itemId]);

  return progress;
}

export function useSelectionMenu(
  canonicalUrl: string,
  bodyRef: React.RefObject<HTMLDivElement | null>,
) {
  const [menu, setMenu] = useState<SelMenu | null>(null);

  useEffect(() => {
    const onScroll = () => {
      setMenu((current) => (current ? selectionMenu() : null));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [canonicalUrl]);

  function onSelectEnd() {
    const sel = window.getSelection();
    const next = selectionMenu();
    if (!next || !bodyRef.current?.contains(sel?.anchorNode ?? null)) {
      setMenu(null);
      return;
    }
    setMenu(next);
  }

  function clearMenu() {
    setMenu(null);
  }

  return { menu, setMenu, onSelectEnd, clearMenu };
}
