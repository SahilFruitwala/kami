import type { PointerEvent } from "react";

/** Hover tilt toward the cursor (max ±4°) for front-facing covers. */
export function useTilt() {
  function onPointerMove(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
    el.style.setProperty("--rx", `${(-y * 8).toFixed(2)}deg`);
    el.dataset.hover = "true";
  }
  function onPointerLeave(e: PointerEvent<HTMLElement>) {
    const el = e.currentTarget;
    el.style.removeProperty("--ry");
    el.style.removeProperty("--rx");
    delete el.dataset.hover;
  }
  return { onPointerMove, onPointerLeave };
}
