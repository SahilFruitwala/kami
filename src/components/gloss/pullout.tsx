import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * The Gloss signature move: pull an object off the shelf and open it.
 *
 * The object is a 3D box with two visible faces — the spine (left side) and
 * the front board — so one `rotateY(90deg → 0)` turns spine into cover. The
 * board then swings open on its left hinge to reveal the inside (left page)
 * and the page underneath (right page). Books, VHS sleeves and DVD cases all
 * use this; only the faces differ.
 *
 * Layers (each animates one thing, so transforms never fight):
 *   stage (perspective) › mover (fly: translate + scale)
 *     › recenter (translateX) › turner (rotateY) › faces + board (swing)
 *
 * Motion rule: the object moves, the world fades. The page behind only
 * changes opacity.
 */

export type PullOutApi = {
  /** Content is in view (drives the staggered reveal). */
  revealed: boolean | "out";
  /** Put it back: reverse the sequence, faster. */
  close: () => void;
  /** Blur the book and the page away, then run `then` (e.g. navigate). */
  dissolve: (then: () => void) => void;
};

export type PullOutSource = {
  /** `data-gloss-id` of the element on the shelf/grid to fly from and back to. */
  id: string;
  /** Spines turn to show the cover; front-facing covers skip the turn. */
  kind: "spine" | "cover";
};

const PERSPECTIVE = 1600;
const DIM_SELECTOR = "#main";

type Geometry = {
  W: number;
  H: number;
  D: number;
  narrow: boolean;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

let springCache: string | null | undefined;
/** spring-book (stiffness 260, damping 26, mass 1) sampled into CSS `linear()`. */
function springEasing(): string {
  if (springCache !== undefined) return springCache ?? "cubic-bezier(0.22, 1, 0.36, 1)";
  const supported =
    typeof CSS !== "undefined" && CSS.supports("transition-timing-function", "linear(0, 1)");
  if (!supported) {
    springCache = null;
    return "cubic-bezier(0.22, 1, 0.36, 1)";
  }
  const k = 260;
  const c = 26;
  const dt = 1 / 240;
  let x = 0;
  let v = 0;
  const samples: number[] = [0];
  // Simulate 0.6s (the spec's fly duration); the spring is settled by then.
  for (let t = dt; t <= 0.6 + 1e-9; t += dt) {
    const f = -k * (x - 1) - c * v;
    v += f * dt;
    x += v * dt;
    samples.push(x);
  }
  const step = Math.max(1, Math.floor(samples.length / 48));
  const pts: string[] = [];
  for (let i = 0; i < samples.length; i += step) pts.push(samples[i]!.toFixed(4));
  pts.push("1");
  springCache = `linear(${pts.join(", ")})`;
  return springCache;
}

function findSource(id: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[data-gloss-id="${CSS.escape(id)}"]`);
}

function measure(cover: { w: number; h: number }, depthRatio: number): Geometry {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const narrow = vw < 760;
  const aspect = cover.h / cover.w;
  const W = Math.max(180, Math.min(cover.w, narrow ? vw - 32 : (vw - 64) / 2, (vh - 56) / aspect));
  const H = W * aspect;
  return { W, H, D: Math.max(8, H * depthRatio), narrow };
}

/** Mover transform that makes the turned spine (or the cover) sit over `r`. */
function originTransform(r: DOMRect, g: Geometry, kind: PullOutSource["kind"]): string {
  const vcx = window.innerWidth / 2;
  const vcy = window.innerHeight / 2;
  const rcx = r.left + r.width / 2;
  const rcy = r.top + r.height / 2;
  if (kind === "cover") {
    const s = r.height / g.H;
    const k = PERSPECTIVE / (PERSPECTIVE - (s * g.D) / 2);
    return `translate3d(${(rcx - vcx) / k}px, ${(rcy - vcy) / k}px, 0) scale3d(${s}, ${s}, ${s}) rotateX(4deg)`;
  }
  // Turned 90°, the spine face sits W/2 nearer the camera, so perspective
  // magnifies it by k. Solve H·s·k = r.height for s.
  const P = PERSPECTIVE;
  const s = (r.height * P) / (g.H * P + (r.height * g.W) / 2);
  const k = P / (P - (s * g.W) / 2);
  return `translate3d(${(rcx - vcx) / k}px, ${(rcy - vcy) / k}px, 0) scale3d(${s}, ${s}, ${s})`;
}

export function PullOut({
  source,
  coverSize,
  depthRatio,
  label,
  spineFace,
  cover,
  inside,
  page,
  onClosed,
}: {
  source: PullOutSource;
  /** Closed cover size at full scale (px). Shrinks to fit the viewport. */
  coverSize: { w: number; h: number };
  /** Box thickness as a fraction of the cover height (spine width / height). */
  depthRatio: number;
  /** Accessible name for the dialog. */
  label: string;
  spineFace: ReactNode;
  cover: ReactNode;
  /** Inside of the front board — the left page of the open spread. */
  inside: ReactNode;
  /** The right page, revealed when the board swings open. */
  page: (api: PullOutApi) => ReactNode;
  onClosed: () => void;
}) {
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [revealed, setRevealed] = useState<boolean | "out">(false);
  const moverRef = useRef<HTMLDivElement>(null);
  const recenterRef = useRef<HTMLDivElement>(null);
  const turnerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const insideRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const phase = useRef<"opening" | "open" | "closing" | "gone">("opening");
  const anims = useRef<Animation[]>([]);
  const timers = useRef<number[]>([]);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const run = (el: Element | null, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
    if (!el) return null;
    const a = el.animate(frames, { fill: "both", ...opts });
    anims.current.push(a);
    return a;
  };

  // Measure once, before paint, so the first frame is already at the shelf.
  useLayoutEffect(() => {
    setGeo(measure(coverSize, depthRatio));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open sequence: lift → turn → fly (+ dim) → swing (+ recentre) → content.
  useLayoutEffect(() => {
    if (!geo) return;
    const el = findSource(source.id);
    const main = document.querySelector<HTMLElement>(DIM_SELECTOR);
    const reduced = prefersReducedMotion();
    const swingTo = "rotateY(-180deg)";
    const recenterTo = geo.narrow ? "translateX(0px)" : `translateX(${geo.W / 2}px)`;
    const dimTo =
      getComputedStyle(stageRef.current ?? document.body)
        .getPropertyValue("--g-dim")
        .trim() || "0.35";

    if (main) main.inert = true;

    if (reduced || !el) {
      if (el) el.dataset.state = "pulled";
      run(stageRef.current, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
      run(main, [{ opacity: 1 }, { opacity: dimTo }], { duration: 150 });
      if (boardRef.current)
        boardRef.current.style.transform = `translateZ(${geo.D / 2}px) ${swingTo}`;
      if (recenterRef.current) recenterRef.current.style.transform = recenterTo;
      if (geo.narrow) run(insideRef.current, [{ opacity: 0 }], { duration: 0 });
      phase.current = "open";
      setRevealed(true);
      return;
    }

    const rest = el.getBoundingClientRect();
    const isSpine = source.kind === "spine";
    const lift = isSpine ? 40 : 4;
    const lifted = new DOMRect(rest.left, rest.top - lift, rest.width, rest.height);
    const from = originTransform(lifted, geo, source.kind);
    const turnStart = isSpine ? 90 : 0;
    const liftMs = isSpine ? 160 : 0;
    const flyDelay = isSpine ? 120 : 0;
    const flyMs = isSpine ? 600 : 500;
    const swingAt = flyDelay + flyMs;

    // Start hidden at the shelf until the spine has risen.
    if (moverRef.current) moverRef.current.style.transform = from;
    if (turnerRef.current) turnerRef.current.style.transform = `rotateY(${turnStart}deg)`;
    if (stageRef.current) stageRef.current.style.visibility = "hidden";
    el.dataset.state = "lifting";

    later(liftMs, () => {
      el.dataset.state = "pulled";
      if (stageRef.current) stageRef.current.style.visibility = "";
      if (isSpine) {
        run(turnerRef.current, [{ transform: "rotateY(90deg)" }, { transform: "rotateY(0deg)" }], {
          duration: 400,
          easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        });
      }
      run(
        moverRef.current,
        [{ transform: from }, { transform: "translate3d(0,0,0) scale3d(1,1,1)" }],
        {
          duration: flyMs,
          delay: flyDelay,
          easing: springEasing(),
        },
      );
      run(main, [{ opacity: 1 }, { opacity: dimTo }], {
        duration: 300,
        delay: flyDelay,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
      run(
        boardRef.current,
        [
          { transform: `translateZ(${geo.D / 2}px) rotateY(0deg)` },
          { transform: `translateZ(${geo.D / 2}px) ${swingTo}` },
        ],
        { duration: 300, delay: swingAt, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
      );
      run(recenterRef.current, [{ transform: "translateX(0px)" }, { transform: recenterTo }], {
        duration: 300,
        delay: swingAt,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      });
      if (geo.narrow) {
        // No room for a spread on a phone: the board swings away entirely.
        run(insideRef.current, [{ opacity: 1 }, { opacity: 0 }], {
          duration: 120,
          delay: swingAt + 180,
        });
      }
      later(swingAt + 300, () => {
        phase.current = "open";
        setRevealed(true);
      });
    });

    return () => {
      // Strict-mode / unmount mid-flight.
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo]);

  // Restore the page behind on unmount, however we leave.
  useEffect(() => {
    return () => {
      for (const t of timers.current) clearTimeout(t);
      for (const a of anims.current) a.cancel();
      const main = document.querySelector<HTMLElement>(DIM_SELECTOR);
      if (main) {
        main.inert = false;
        main.getAnimations().forEach((a) => a.cancel());
      }
      const el = findSource(source.id);
      if (el && el.dataset.state !== "landing") delete el.dataset.state;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the page once it's open so Tab stays inside.
  useEffect(() => {
    if (revealed === true) dialogRef.current?.focus({ preventScroll: true });
  }, [revealed]);

  const close = useCallback(() => {
    if (phase.current === "closing" || phase.current === "gone" || !geo) return;
    const wasOpening = phase.current === "opening";
    phase.current = "closing";
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    // Freeze whatever is mid-flight where it is, then reverse from there.
    for (const a of anims.current) {
      try {
        a.commitStyles();
      } catch {
        /* element gone */
      }
      a.cancel();
    }
    anims.current = [];
    setRevealed("out");

    const main = document.querySelector<HTMLElement>(DIM_SELECTOR);
    const el = findSource(source.id);
    const reduced = prefersReducedMotion();
    const finish = () => {
      phase.current = "gone";
      if (main) {
        main.inert = false;
        main.getAnimations().forEach((a) => a.cancel());
        main.style.opacity = "";
      }
      if (el) {
        el.dataset.state = "landing";
        el.focus({ preventScroll: true });
        window.setTimeout(() => {
          if (el.dataset.state === "landing") delete el.dataset.state;
        }, 200);
      }
      onClosedRef.current();
    };

    const mainFrom = main ? getComputedStyle(main).opacity : "1";
    if (reduced || !el) {
      run(stageRef.current, [{ opacity: 1 }, { opacity: 0 }], { duration: 150 });
      run(main, [{ opacity: mainFrom }, { opacity: 1 }], { duration: 150 });
      later(160, finish);
      return;
    }

    const isSpine = source.kind === "spine";
    const target = originTransform(el.getBoundingClientRect(), geo, source.kind);
    const curBoard = boardRef.current ? getComputedStyle(boardRef.current).transform : "none";
    const curRecenter = recenterRef.current
      ? getComputedStyle(recenterRef.current).transform
      : "none";
    const curMover = moverRef.current ? getComputedStyle(moverRef.current).transform : "none";
    const curTurner = turnerRef.current ? getComputedStyle(turnerRef.current).transform : "none";
    const swingDelay = wasOpening ? 0 : 100;

    if (geo.narrow) run(insideRef.current, [{ opacity: 1 }], { duration: 0 });
    run(
      boardRef.current,
      [{ transform: curBoard }, { transform: `translateZ(${geo.D / 2}px) rotateY(0deg)` }],
      {
        duration: 150,
        delay: swingDelay,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      },
    );
    run(recenterRef.current, [{ transform: curRecenter }, { transform: "translateX(0px)" }], {
      duration: 150,
      delay: swingDelay,
      easing: "cubic-bezier(0.65, 0, 0.35, 1)",
    });
    run(moverRef.current, [{ transform: curMover }, { transform: target }], {
      duration: 350,
      delay: 250,
      easing: "cubic-bezier(0.65, 0, 0.35, 1)",
    });
    run(main, [{ opacity: mainFrom }, { opacity: 1 }], { duration: 350, delay: 250 });
    if (isSpine) {
      run(turnerRef.current, [{ transform: curTurner }, { transform: "rotateY(90deg)" }], {
        duration: 300,
        delay: 450,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      });
    }
    later(isSpine ? 760 : 610, finish);
  }, [geo, source.id, source.kind]);

  const dissolve = useCallback((then: () => void) => {
    if (phase.current !== "open") return;
    phase.current = "gone";
    const main = document.querySelector<HTMLElement>(DIM_SELECTOR);
    const frames = [{ filter: "blur(6px)", opacity: 0 }];
    const reduced = prefersReducedMotion();
    const opts: KeyframeAnimationOptions = {
      duration: reduced ? 120 : 300,
      easing: "cubic-bezier(0.55, 0, 1, 0.45)",
    };
    run(stageRef.current, frames, opts);
    run(main, frames, opts);
    later(reduced ? 120 : 300, then);
  }, []);

  // Esc puts it back.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Keep the spread centred if the window changes size while it's open.
  useEffect(() => {
    function onResize() {
      if (phase.current !== "open") return;
      const g = measure(coverSize, depthRatio);
      for (const a of anims.current) {
        try {
          a.commitStyles();
        } catch {
          /* gone */
        }
        a.cancel();
      }
      anims.current = [];
      if (moverRef.current) moverRef.current.style.transform = "none";
      if (turnerRef.current) turnerRef.current.style.transform = "none";
      if (boardRef.current)
        boardRef.current.style.transform = `translateZ(${g.D / 2}px) rotateY(-180deg)`;
      if (recenterRef.current)
        recenterRef.current.style.transform = g.narrow ? "none" : `translateX(${g.W / 2}px)`;
      if (insideRef.current) insideRef.current.style.opacity = g.narrow ? "0" : "1";
      setGeo(g);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [coverSize, depthRatio]);

  if (!geo || typeof document === "undefined") return null;
  const { W, H, D } = geo;
  const box: CSSProperties = { width: W, height: H, left: 0, top: 0 };

  return createPortal(
    <div ref={stageRef} className="gloss g-stage" style={{ background: "transparent" }}>
      <div className="g-stage-hit" onClick={close} aria-hidden="true" />
      <div
        ref={moverRef}
        className="g-3d"
        style={{
          width: W,
          height: H,
          left: "50%",
          top: "50%",
          marginLeft: -W / 2,
          marginTop: -H / 2,
        }}
      >
        <div ref={recenterRef} className="g-3d" style={box}>
          <div ref={turnerRef} className="g-3d" style={box}>
            {/* Right page: just under the board. */}
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              className="g-face g-page outline-none"
              style={{
                ...box,
                transform: `translateZ(${D / 2 - 1}px)`,
                boxShadow: "var(--g-shadow-lifted)",
              }}
            >
              {page({ revealed, close, dissolve })}
            </div>
            {/* Spine: the box's left side. */}
            <div
              className="g-face"
              aria-hidden="true"
              style={{
                width: D,
                height: H,
                left: 0,
                top: 0,
                transform: `translateX(${-D / 2}px) rotateY(-90deg)`,
              }}
            >
              {spineFace}
            </div>
            {/* Front board: cover outside, endpaper inside. */}
            <div
              ref={boardRef}
              className="g-3d"
              style={{
                ...box,
                transformOrigin: "left center",
                transform: `translateZ(${D / 2}px)`,
              }}
            >
              <div
                className="g-face"
                aria-hidden="true"
                style={{ ...box, boxShadow: "var(--g-shadow-lifted)", borderRadius: 4 }}
              >
                {cover}
              </div>
              <div
                ref={insideRef}
                className="g-face"
                aria-hidden="true"
                style={{
                  ...box,
                  transform: "rotateY(180deg)",
                  boxShadow: "var(--g-shadow-lifted)",
                  borderRadius: 4,
                }}
              >
                {inside}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
