import { useEffect, useState } from "react";
import { selectionMenu, type SelMenu } from "@/lib/selection-menu.ts";

export function useReaderProgress(canonicalUrl: string) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max <= 0 ? 0 : Math.min(1, el.scrollTop / max));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [canonicalUrl]);

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
