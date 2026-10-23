import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const ACTIVE = '[aria-pressed="true"], [aria-current="page"], [aria-selected="true"]';

/**
 * A pill that slides under whichever child of a control is active. Attach
 * `ref` to the control and `pill` to a `.g-seg-pill` span inside it; the
 * hook sets the container's `data-ready` once the first measure is done so
 * the first paint does not animate in from nothing.
 */
export function useSlidePill<T extends HTMLElement>(deps: readonly unknown[]) {
  const ref = useRef<T>(null);
  const pill = useRef<HTMLSpanElement>(null);

  const measure = useCallback(() => {
    const container = ref.current;
    const el = pill.current;
    if (!container || !el) return;
    const active = container.querySelector<HTMLElement>(ACTIVE);
    if (!active) {
      el.style.width = "0px";
      return;
    }
    // Rects, not offsetLeft: the active child may sit inside a wrapper.
    const box = container.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    el.style.width = `${rect.width}px`;
    el.style.transform = `translateX(${rect.left - box.left + container.scrollLeft - container.clientLeft}px)`;
  }, []);

  useLayoutEffect(() => {
    measure();
    const container = ref.current;
    if (!container) return;
    const raf = requestAnimationFrame(() => container.setAttribute("data-ready", ""));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  return { ref, pill };
}
