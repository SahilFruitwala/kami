import { useCallback, useEffect, useRef, type ReactNode } from "react";

/**
 * A single row of spines on a 3D rail. The book in the middle turns to show
 * its cover, lifts and tips a few degrees; its neighbours slide apart to make
 * room. Scrolling, dragging and arrow keys all move one
 * continuous position that eases toward a whole-book target, so every gesture
 * ends with a book squared in the middle.
 *
 * Motion model (ported from layoffsandhires.com/engineering):
 *   s  the position on screen, in books
 *   T  where it is headed (snaps to a whole book when input stops)
 *   d  how "centred" a book is (smoothstep of 1 - |offset|), 0..1
 *   tape transform = translate + rotateZ(-4.5deg * d) + rotateY(-90deg * d)
 *
 * Only transforms are written per frame, and the loop stops itself once
 * everything has settled.
 */

/** Cover width / height. Kami covers are 430 x 620. */
const ASPECT = 0.694;
/** Small shelves repeat three times so they wrap; big ones are a straight row. */
const LOOP_MAX = 24;
const PERSPECTIVE = 2200;

const mod = (a: number, n: number) => ((a % n) + n) % n;
/** Signed distance from `s` to index `i` on a ring of length `n`. */
function ringOffset(i: number, s: number, n: number) {
  const r = mod(i - s, n);
  return r > n / 2 ? r - n : r;
}
/** Slot between the centred cover and its neighbours opens as a book nears the middle. */
function spread(c: number, ws: number, gap: number, dd: number) {
  const open = Math.abs(c) < 1 ? (c + Math.sin(Math.PI * c) / Math.PI) / 2 : 0.5 * Math.sign(c);
  return c * (ws + gap) + (dd - ws + 1.6 * gap) * open;
}

type Tape = {
  el: HTMLDivElement;
  sp: HTMLDivElement;
  cv: HTMLDivElement;
  lift: number;
  vis: boolean;
};

type State = {
  s: number;
  T: number;
  H: number;
  ws: number;
  gap: number;
  dd: number;
  width: number;
  mx: number;
  my: number;
  over: boolean;
  hover: number;
  tiltX: number;
  tiltY: number;
  down: boolean;
  dragging: boolean;
  moved: boolean;
  sx: number;
  T0: number;
  running: boolean;
  last: number;
  raf: number;
  wheelTimer: number;
  active: number;
};

export function SpineCarousel<T>({
  items,
  getId,
  renderSpine,
  renderCover,
  caption,
  onOpen,
  ariaLabel,
}: {
  items: T[];
  getId: (item: T) => string;
  /** Fills a box the size of the spine face. */
  renderSpine: (item: T) => ReactNode;
  /** Fills a box the size of the cover. */
  renderCover: (item: T) => ReactNode;
  /** Plain text for the line under the shelf and the screen-reader live region. */
  caption: (item: T) => string;
  /** The centred book was chosen. `from` is its cover on screen, for the open animation. */
  onOpen: (item: T, from: DOMRect) => void;
  ariaLabel: string;
}) {
  const n = items.length;
  // A lone book has nothing to wrap to: no repeated neighbours, no stepping.
  const loop = n > 1 && n <= LOOP_MAX;
  const copies = loop ? 3 : 1;
  const total = copies * n;
  const start = loop ? n : 0;

  const rootRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const tapes = useRef<(Tape | undefined)[]>([]);
  const st = useRef<State>({
    s: start,
    T: start,
    H: 0,
    ws: 0,
    gap: 0,
    dd: 0,
    width: 0,
    mx: 0,
    my: 0,
    over: false,
    hover: -1,
    tiltX: 0,
    tiltY: 0,
    down: false,
    dragging: false,
    moved: false,
    sx: 0,
    T0: 0,
    running: false,
    last: 0,
    raf: 0,
    wheelTimer: 0,
    active: -1,
  });
  // Latest props for handlers registered once.
  const live = useRef({ items, caption, onOpen });
  live.current = { items, caption, onOpen };

  const setTape = useCallback((i: number, el: HTMLDivElement | null) => {
    if (!el) {
      tapes.current[i] = undefined;
      return;
    }
    tapes.current[i] = {
      el,
      sp: el.children[0] as HTMLDivElement,
      cv: el.children[1] as HTMLDivElement,
      lift: 0,
      vis: true,
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    const probe = probeRef.current;
    if (!root || !stage || !probe || n === 0) return;
    const s = st.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const offset = (i: number) => (loop ? ringOffset(i, s.s, total) : i - s.s);
    const clampT = (t: number) => (loop ? t : Math.max(0, Math.min(n - 1, t)));
    const settle = () => {
      s.T = clampT(Math.round(s.T));
      kick();
    };
    const nearest = () => {
      let best = 0;
      let bestD = Infinity;
      tapes.current.forEach((t, i) => {
        if (!t) return;
        const d = Math.abs(offset(i));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };

    function measure() {
      s.H = probe!.getBoundingClientRect().height;
      s.ws = s.H * 0.15;
      s.gap = s.H * 0.03;
      s.dd = s.H * ASPECT;
      s.width = root!.clientWidth;
      stage!.style.setProperty("--hpx", `${s.H}px`);
      stage!.style.setProperty("--ws", `${s.ws}px`);
      stage!.style.setProperty("--dd", `${s.dd}px`);
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now;

      const prev = s.s;
      s.s = reduce
        ? s.T
        : (() => {
            const next = s.s + (s.T - s.s) * (1 - Math.exp(-(s.dragging ? 18 : 5.2) * dt));
            return Math.abs(s.T - next) < 1e-4 ? s.T : next;
          })();
      // Keep the numbers small on a long-running loop.
      if (loop && Math.abs(s.s) > 4 * total) {
        const shift = Math.trunc(s.s / total) * total;
        s.s -= shift;
        s.T -= shift;
        s.T0 -= shift;
      }

      const act = mod(Math.round(s.s), n);
      if (act !== s.active) {
        s.active = act;
        const it = live.current.items[act];
        if (it && captionRef.current) captionRef.current.textContent = live.current.caption(it);
      }

      // Pointer over the centred cover tips it toward the cursor.
      const box = root!.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const onCover =
        s.over &&
        Math.abs(s.mx - cx) < 0.55 * s.dd &&
        Math.abs(s.my - cy) < 0.55 * s.H &&
        Math.abs(s.T - s.s) < 0.3;
      const tyTarget = reduce ? 0 : onCover ? ((s.mx - cx) / (0.55 * s.dd)) * 9 : 0;
      const txTarget = reduce ? 0 : onCover ? (-(s.my - cy) / (s.H / 2)) * 6 : 0;
      const tk = 1 - Math.exp(-7 * dt);
      s.tiltY += (tyTarget - s.tiltY) * tk;
      s.tiltX += (txTarget - s.tiltX) * tk;
      const lk = reduce ? 1 : 1 - Math.exp(-12 * dt);

      const cull = s.width / 2 + 1.5 * s.dd;
      let lifting = false;
      tapes.current.forEach((t, i) => {
        if (!t) return;
        const c = offset(i);
        const p = spread(c, s.ws, s.gap, s.dd);
        const liftTarget = s.hover === i && Math.abs(c) > 0.5 ? 1 : 0;
        t.lift += (liftTarget - t.lift) * lk;
        if (Math.abs(liftTarget - t.lift) > 0.004) lifting = true;
        if (Math.abs(p) > cull) {
          if (t.vis) {
            t.el.style.visibility = "hidden";
            t.vis = false;
          }
          return;
        }
        if (!t.vis) {
          t.el.style.visibility = "";
          t.vis = true;
        }
        const k = Math.max(0, 1 - Math.abs(c));
        const d = k * k * (3 - 2 * k);
        t.el.style.transform =
          `perspective(${PERSPECTIVE}px) translate3d(${p}px,${-0.025 * d * s.H - 0.045 * t.lift * s.H}px,${0.2 * d * s.H}px)` +
          ` rotateZ(${-4.5 * d}deg) rotateX(${s.tiltX * d}deg) rotateY(${-90 * d + s.tiltY * d}deg)`;
        t.el.style.zIndex = String(Math.round(100 - 4 * Math.abs(c)));
        t.sp.style.setProperty("--shade", (0.55 * d).toFixed(3));
        t.cv.style.setProperty("--shade", ((1 - d) * 0.5).toFixed(3));
      });

      stage!.dataset.ready = "";

      const moving = s.s !== prev || s.s !== s.T || s.dragging;
      const tilting = Math.abs(s.tiltX - txTarget) > 0.01 || Math.abs(s.tiltY - tyTarget) > 0.01;
      if (moving || tilting || lifting) {
        s.raf = requestAnimationFrame(frame);
      } else {
        s.running = false;
      }
    }

    function kick() {
      if (s.running) return;
      s.running = true;
      s.last = performance.now();
      s.raf = requestAnimationFrame(frame);
    }

    function go(delta: number) {
      s.T = clampT(Math.round(s.T) + delta);
      kick();
    }

    function open() {
      const idx = nearest();
      const item = live.current.items[mod(idx, n)];
      const t = tapes.current[idx];
      if (!item || !t) return;
      s.T = s.s = clampT(Math.round(s.s));
      live.current.onOpen(item, t.cv.getBoundingClientRect());
    }

    function onWheel(e: WheelEvent) {
      // Sideways gestures drive the shelf; plain vertical scroll still scrolls the page.
      if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      s.T = clampT(s.T + (e.deltaX / (s.ws + s.gap)) * 0.5);
      window.clearTimeout(s.wheelTimer);
      s.wheelTimer = window.setTimeout(settle, 160);
      kick();
    }
    function onDown(e: PointerEvent) {
      if (e.button !== 0) return;
      s.down = true;
      s.dragging = false;
      s.moved = false;
      s.sx = e.clientX;
      s.T0 = s.T;
    }
    function onMove(e: PointerEvent) {
      s.mx = e.clientX;
      s.my = e.clientY;
      if (e.pointerType === "mouse" && s.over) kick();
      if (!s.down) return;
      const dx = e.clientX - s.sx;
      if (!s.dragging && Math.abs(dx) > 5) {
        s.dragging = true;
        s.moved = true;
      }
      if (s.dragging) {
        s.T = clampT(s.T0 - dx / (s.ws + s.gap));
        kick();
      }
    }
    function onUp() {
      if (s.dragging) s.T = clampT(Math.round(s.T));
      s.dragging = false;
      s.down = false;
      kick();
    }
    function onCancel() {
      onUp();
      s.moved = false;
    }
    function onClick(e: MouseEvent) {
      if (s.moved) return;
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-v]");
      if (!el) {
        // The turned cover isn't hit-testable in Chrome, so check its rectangle.
        const t = tapes.current[nearest()];
        const r = t?.cv.getBoundingClientRect();
        if (
          r &&
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom
        )
          open();
        return;
      }
      const rel = offset(Number(el.dataset.v));
      if (Math.abs(rel) < 0.5) open();
      else {
        s.T = clampT(Math.round(s.T + rel));
        kick();
      }
    }
    function onOver(e: PointerEvent) {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-v]");
      s.hover = el ? Number(el.dataset.v) : -1;
      kick();
    }
    function onEnter(e: PointerEvent) {
      if (e.pointerType === "mouse") s.over = true;
    }
    function onLeave() {
      s.over = false;
      s.hover = -1;
      kick();
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "Home" && !loop) go(-n);
      else if (e.key === "End" && !loop) go(n);
      else if (e.key === "Enter" || e.key === " ") open();
      else return;
      e.preventDefault();
    }
    function onStep(e: Event) {
      go((e as CustomEvent<number>).detail);
    }
    function onResize() {
      measure();
      kick();
    }

    measure();
    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("click", onClick);
    root.addEventListener("pointerover", onOver);
    root.addEventListener("pointerenter", onEnter);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("keydown", onKey);
    root.addEventListener("kami-step", onStep);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    const ro = new ResizeObserver(onResize);
    ro.observe(root);
    kick();

    return () => {
      cancelAnimationFrame(s.raf);
      window.clearTimeout(s.wheelTimer);
      s.running = false;
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("click", onClick);
      root.removeEventListener("pointerover", onOver);
      root.removeEventListener("pointerenter", onEnter);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("keydown", onKey);
      root.removeEventListener("kami-step", onStep);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      ro.disconnect();
    };
  }, [n, loop, total]);

  const step = (delta: number) =>
    rootRef.current?.dispatchEvent(new CustomEvent("kami-step", { detail: delta }));

  if (n === 0) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={rootRef}
        className="g-car"
        role="group"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        tabIndex={0}
      >
        <div ref={probeRef} className="g-car-probe" aria-hidden="true" />
        <div ref={stageRef} className="g-car-stage">
          {Array.from({ length: total }, (_, i) => {
            const item = items[i % n]!;
            return (
              <div
                key={`${Math.floor(i / n)}:${getId(item)}`}
                ref={(el) => setTape(i, el)}
                data-v={i}
                className="g-car-tape"
                aria-hidden="true"
              >
                <div className="g-car-face g-car-sp">{renderSpine(item)}</div>
                <div className="g-car-face g-car-cv">{renderCover(item)}</div>
              </div>
            );
          })}
        </div>
      </div>
      <p ref={captionRef} aria-live="polite" className="sr-only">
        {caption(items[start % n]!)}
      </p>
      {n > 1 ? (
        <div className="flex items-center gap-3">
          <StepButton label="Previous book" onClick={() => step(-1)} dir="prev" />
          <StepButton label="Next book" onClick={() => step(1)} dir="next" />
        </div>
      ) : null}
    </div>
  );
}

function StepButton({
  label,
  onClick,
  dir,
}: {
  label: string;
  onClick: () => void;
  dir: "prev" | "next";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="g-btn g-btn--ghost size-11 p-0"
    >
      <svg
        viewBox="0 0 18 10"
        className="h-2.5 w-[18px] fill-none stroke-current stroke-[1.4]"
        aria-hidden="true"
      >
        <path d={dir === "prev" ? "M5 1 L1 5 L5 9 M1 5 H17" : "M13 1 L17 5 L13 9 M17 5 H1"} />
      </svg>
    </button>
  );
}
