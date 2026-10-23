import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

export type ShelfGroup<T> = {
  id: string;
  /** Divider card standing on the shelf before the group (see ShelfDivider). */
  label?: ReactNode;
  items: T[];
};

type Tip = { id: string; left: number; top: number; title: string; sub: string };

/** Spines past this index arrive together, so long shelves don't crawl in. */
const MAX_STAGGER = 40;

/**
 * Spines standing on planks. Hover or focus lifts a spine and shows a
 * tooltip (swaps instantly, no fade, so scanning feels fast). Arrow keys walk
 * the shelf; Enter takes a spine down. Changing `animateKey` replays the
 * slide-in ripple (filter / arrange).
 */
export function Shelf<T>({
  groups,
  getId,
  renderSpine,
  tooltip,
  onPick,
  animateKey,
  variant = "book",
  ariaLabel,
  decoration,
  bookends = true,
}: {
  groups: ShelfGroup<T>[];
  getId: (item: T) => string;
  renderSpine: (item: T) => ReactNode;
  tooltip: (item: T) => { title: string; sub: string; label: string };
  onPick: (item: T) => void;
  animateKey: string;
  variant?: "book" | "media";
  ariaLabel: string;
  /** Rendered at the end of the last shelf (e.g. a stack of lying books). */
  decoration?: ReactNode;
  bookends?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const firstId = groups.find((g) => g.items.length > 0)?.items[0];
  const rovingId = activeId ?? (firstId != null ? getId(firstId) : null);

  function showTip(el: HTMLElement, item: T) {
    const root = rootRef.current;
    if (!root) return;
    const r = el.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    const t = tooltip(item);
    // Keep the tooltip inside the column on the right edge.
    const left = Math.min(r.left - rr.left, Math.max(0, rr.width - 260));
    setTip({ id: getId(item), left, top: r.top - rr.top - 14, title: t.title, sub: t.sub });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const root = rootRef.current;
    if (!root) return;
    const spines = Array.from(root.querySelectorAll<HTMLElement>(".g-spine"));
    const idx = spines.findIndex((s) => s === document.activeElement);
    if (idx < 0) return;
    e.preventDefault();
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = Math.min(spines.length - 1, idx + 1);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, idx - 1);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = spines.length - 1;
    spines[next]?.focus();
  }

  let i = 0;

  return (
    <div
      ref={rootRef}
      className="relative"
      role="group"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      onMouseLeave={() => setTip(null)}
    >
      {/* One continuous shelf: every spine flows left to right and wraps onto
          the next plank when the row is full. Groups are marked by a divider
          card standing on the shelf, not by separate shelves. */}
      <div
        key={animateKey}
        className={cn("g-shelf w-full", variant === "media" && "g-shelf--media")}
      >
        {groups.map((group) => [
          group.label && groups.length > 1 ? (
            <div
              key={`divider:${group.id}`}
              className="g-slot g-slot--enter"
              style={{ "--i": Math.min(i, MAX_STAGGER) } as CSSProperties}
            >
              {group.label}
            </div>
          ) : null,
          ...group.items.map((item) => {
            const id = getId(item);
            const t = tooltip(item);
            const n = Math.min(i++, MAX_STAGGER);
            return (
              <div key={id} className="g-slot g-slot--enter" style={{ "--i": n } as CSSProperties}>
                <button
                  type="button"
                  className="g-spine"
                  data-gloss-id={id}
                  tabIndex={rovingId === id ? 0 : -1}
                  aria-label={t.label}
                  onClick={() => {
                    setTip(null);
                    onPick(item);
                  }}
                  onMouseEnter={(e) => showTip(e.currentTarget, item)}
                  onFocus={(e) => {
                    setActiveId(id);
                    if (e.currentTarget.matches(":focus-visible")) showTip(e.currentTarget, item);
                  }}
                  onBlur={() => setTip((cur) => (cur?.id === id ? null : cur))}
                >
                  {renderSpine(item)}
                </button>
              </div>
            );
          }),
        ])}
        {decoration ? (
          <div className="g-slot g-fade-late ml-auto pr-2">{decoration}</div>
        ) : bookends ? (
          <div className="g-slot g-fade-late ml-1.5">
            <span className="g-bookend" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      {tip ? (
        <div
          className="g-tooltip"
          role="presentation"
          style={{ left: tip.left, top: tip.top, transform: "translateY(-100%)" }}
        >
          <p className="g-tooltip-title line-clamp-2">{tip.title}</p>
          {tip.sub ? <p className="g-tooltip-sub">{tip.sub}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A shelf divider: a slim card standing between groups, its tab in the
 * group's colour, the name running up the card like a spine label.
 */
export function ShelfDivider({
  label,
  count,
  color,
  icon,
  height = 150,
}: {
  label: string;
  count: number;
  color: string;
  icon?: ReactNode;
  height?: number;
}) {
  return (
    <span
      className="g-divider"
      style={{ height, "--div": color } as CSSProperties}
      title={`${label}, ${count}`}
    >
      <span className="g-divider-tab">{icon}</span>
      <span className="g-divider-text">
        {label}
        <span className="g-divider-count">{count}</span>
      </span>
    </span>
  );
}
