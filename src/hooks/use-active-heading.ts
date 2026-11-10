import { useEffect, useRef, useState, type RefObject } from "react";

/** Last heading whose top has crossed the reading probe. */
export function activeHeadingFromTops(
  tops: { id: string; top: number }[],
  probe: number,
): string | undefined {
  let current: string | undefined;
  for (const row of tops) {
    if (row.top <= probe) current = row.id;
  }
  return current ?? tops[0]?.id;
}

function headingNode(root: HTMLElement | null, id: string): HTMLElement | null {
  const fromRoot = root?.querySelector(`#${CSS.escape(id)}`);
  if (fromRoot instanceof HTMLElement) return fromRoot;
  const fromDoc = document.getElementById(id);
  return fromDoc instanceof HTMLElement ? fromDoc : null;
}

/** Which heading is in view, so the contents list can mark the place. */
export function useActiveHeading(
  root: RefObject<HTMLElement | null>,
  ids: string[],
  version: string,
) {
  const [activeId, setActiveId] = useState<string | undefined>(ids[0]);
  const pinnedId = useRef<string | null>(null);
  const key = ids.join("|");

  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (!list.length) {
      setActiveId(undefined);
      return;
    }

    function probeLine() {
      return Math.max(140, Math.min(320, window.innerHeight * 0.32));
    }

    function sync() {
      const probe = probeLine();
      const pin = pinnedId.current;
      if (pin) {
        const node = headingNode(root.current, pin);
        const top = node ? node.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
        if (top <= probe + 48) pinnedId.current = null;
        else {
          setActiveId(pin);
          return;
        }
      }
      const tops = list.map((id) => {
        const node = headingNode(root.current, id);
        return {
          id,
          top: node ? node.getBoundingClientRect().top : Number.POSITIVE_INFINITY,
        };
      });
      const next = activeHeadingFromTops(tops, probe);
      setActiveId((prev) => (prev === next ? prev : next));
    }

    sync();
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [root, key, version]);

  function lockHeading(id: string) {
    pinnedId.current = id;
    setActiveId(id);
    window.setTimeout(() => {
      if (pinnedId.current === id) pinnedId.current = null;
    }, 800);
  }

  return [activeId, lockHeading] as const;
}
