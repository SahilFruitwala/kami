import { useEffect, useState, type RefObject } from "react";

/** Which heading is in view, so the contents list can mark the place. */
export function useActiveHeading(root: RefObject<HTMLElement | null>, ids: string[]) {
  const [activeId, setActiveId] = useState<string | undefined>();
  const key = ids.join("|");

  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (!list.length) {
      setActiveId(undefined);
      return;
    }
    const el = root.current;
    if (!el) return;
    const nodes = list
      .map((id) => el.querySelector(`#${CSS.escape(id)}`))
      .filter((node): node is HTMLElement => node instanceof HTMLElement);
    if (!nodes.length) return;

    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target.id) visible.set(entry.target.id, entry.isIntersecting);
        }
        const current = list.find((id) => visible.get(id));
        if (current) setActiveId(current);
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: 0 },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [root, key]);

  return [activeId, setActiveId] as const;
}
