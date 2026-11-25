import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PullOutApi } from "@/components/gloss/pullout.tsx";

/**
 * Opens a shelf book into a full-screen page. The page starts clipped to the
 * cover's rectangle, tipped -4.5deg like the cover on the rail, and the clip
 * grows to fill the screen while it straightens. Closing runs it backwards.
 * (Ported from layoffsandhires.com/engineering.)
 *
 * The clip animates on the compositor via WAAPI, so it stays smooth while the
 * reader route loads behind it.
 */

const OPEN_MS = 1050;
const OPEN_EASE = "cubic-bezier(.76,0,.18,1)";
const CLOSE_MS = 800;
const CLOSE_EASE = "cubic-bezier(.22,1,.36,1)";
const TILT = "-4.5deg";
/** The page content waits for the clip to be most of the way open. */
const REVEAL_AT = 620;

const clipOf = (r: DOMRect) =>
  `inset(${r.top}px ${window.innerWidth - r.right}px ${window.innerHeight - r.bottom}px ${r.left}px round 3px)`;

export function ShelfDetail({
  from,
  label,
  cover,
  page,
  onClosed,
}: {
  /** The cover on the rail, in viewport coordinates, when it was chosen. */
  from: DOMRect;
  label: string;
  cover: ReactNode;
  page: (api: PullOutApi) => ReactNode;
  onClosed: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const [revealed, setRevealed] = useState<boolean | "out">(false);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.style.transformOrigin = `${from.left + from.width / 2}px ${from.top + from.height / 2}px`;
    el.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { clipPath: clipOf(from), transform: `rotate(${TILT})` },
            { clipPath: "inset(0px 0px 0px 0px round 0px)", transform: "rotate(0deg)" },
          ],
      { duration: reduce ? 200 : OPEN_MS, easing: OPEN_EASE, fill: "both" },
    );
    const t = window.setTimeout(() => setRevealed(true), reduce ? 0 : REVEAL_AT);
    return () => window.clearTimeout(t);
    // Runs once per open; `from` never changes for a mounted overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The page behind stops taking focus and clicks while this is up.
  useEffect(() => {
    const main = document.getElementById("main");
    const returnTo = document.activeElement as HTMLElement | null;
    main?.setAttribute("inert", "");
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      main?.removeAttribute("inert");
      returnTo?.focus?.({ preventScroll: true });
    };
  }, []);

  const close = useCallback(() => {
    const el = rootRef.current;
    if (!el || closing.current) return;
    closing.current = true;
    setRevealed("out");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.getAnimations().forEach((a) => a.cancel());
    const anim = el.animate(
      reduce
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { clipPath: "inset(0px 0px 0px 0px round 0px)", transform: "rotate(0deg)", opacity: 1 },
            { opacity: 1, offset: 0.6 },
            { clipPath: clipOf(from), transform: `rotate(${TILT})`, opacity: 0 },
          ],
      { duration: reduce ? 150 : CLOSE_MS, easing: CLOSE_EASE, fill: "both" },
    );
    anim.onfinish = onClosed;
  }, [from, onClosed]);

  const dissolve = useCallback((then: () => void) => {
    const el = rootRef.current;
    if (!el) return then();
    el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 250,
      easing: "ease-out",
      fill: "both",
    }).onfinish = then;
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={rootRef}
      className="gloss g-shelf-detail"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
    >
      <div className="g-shelf-detail-cover" aria-hidden="true">
        {cover}
      </div>
      <div className="g-shelf-detail-page g-page">{page({ revealed, close, dissolve })}</div>
    </div>,
    document.body,
  );
}
