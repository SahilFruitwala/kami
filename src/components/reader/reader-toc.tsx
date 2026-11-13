import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils.ts";

export type TocEntry = { id: string; text: string; level: number };

/** Fewer headings than this and a contents list is just noise. */
const MIN_ENTRIES = 3;

/**
 * Reads h2–h4 headings out of the rendered article body, giving each a stable
 * id so the list can scroll to it. Re-runs whenever the body HTML changes.
 */
export function useArticleToc(bodyRef: RefObject<HTMLDivElement | null>, html: string) {
  const [entries, setEntries] = useState<TocEntry[]>([]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const next: TocEntry[] = [];
    root.querySelectorAll<HTMLElement>("h2, h3, h4").forEach((el, i) => {
      const text = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (!text) return;
      el.id = `toc-${i}`;
      // Land below the sticky reader header when jumping.
      el.style.scrollMarginTop = "5rem";
      next.push({ id: el.id, text, level: Number(el.tagName[1]) });
    });
    setEntries(next.length >= MIN_ENTRIES ? next : []);
  }, [bodyRef, html]);

  return entries;
}

/** Tracks which heading is nearest the top of the viewport. */
export function useActiveHeading(entries: TocEntry[]) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (entries.length === 0) return;
    function update() {
      let current: string | null = null;
      for (const entry of entries) {
        const el = document.getElementById(entry.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 120) current = entry.id;
        else break;
      }
      setActive(current);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [entries]);

  return active;
}

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function indentOf(entries: TocEntry[], entry: TocEntry, step: number, base: number) {
  const minLevel = Math.min(...entries.map((e) => e.level));
  return `${base + (entry.level - minLevel) * step}rem`;
}

/**
 * Desktop, standard mode: an always-visible "On this page" list at the top of
 * the marginalia column. No button, no popover — structure at a glance.
 */
export function ReaderTocAside({
  entries,
  active,
  percent,
}: {
  entries: TocEntry[];
  active: string | null;
  percent: number;
}) {
  if (entries.length === 0) return null;
  const activeIndex = entries.findIndex((e) => e.id === active);

  return (
    <nav aria-label="On this page" className="hidden lg:block">
      <p className="mb-2 flex items-center justify-between font-sans text-[11px] tracking-[0.08em] uppercase opacity-60">
        <span>On this page</span>
        <span className="tabular-nums">{percent}%</span>
      </p>
      <ol className="border-l border-current/15">
        {entries.map((entry, i) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => jumpTo(entry.id)}
              aria-current={active === entry.id ? "location" : undefined}
              style={{ paddingLeft: indentOf(entries, entry, 0.75, 0.75) }}
              className={cn(
                "-ml-px block w-full border-l-2 py-1.5 pr-2 text-left font-sans text-[13px] leading-snug transition-colors hover:opacity-100",
                active === entry.id
                  ? "border-current font-semibold opacity-100"
                  : "border-transparent opacity-70",
                i < activeIndex && "opacity-45",
              )}
            >
              {entry.text}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/**
 * Desktop, focus mode: hairline ticks on the right edge, dimmed like the focus
 * dock. Hover, keyboard focus or the T key expands them into the heading list.
 */
export function ReaderTocRail({ entries, active }: { entries: TocEntry[]; active: string | null }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const open = pinned || hover;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === "t" || event.key === "T") setPinned((v) => !v);
      else if (event.key === "Escape") setPinned(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (entries.length === 0) return null;

  return (
    <nav
      aria-label="On this page"
      className="fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 md:block"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      {open ? (
        <div className="screen-scroll mr-3 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-line bg-surface/95 p-2 text-ink shadow-device backdrop-blur-xl">
          <p className="flex items-center justify-between px-2 pt-1 pb-1.5 font-sans text-[11px] tracking-[0.08em] text-ink-muted uppercase">
            <span>On this page</span>
            <kbd className="font-sans">T</kbd>
          </p>
          <ol>
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(entry.id)}
                  aria-current={active === entry.id ? "location" : undefined}
                  style={{ paddingLeft: indentOf(entries, entry, 0.75, 0.5) }}
                  className={cn(
                    "block w-full rounded-lg py-1.5 pr-2 text-left font-sans text-[13px] leading-snug transition-colors hover:bg-paper-warm/60",
                    active === entry.id ? "bg-paper-warm font-semibold text-ink" : "text-ink-soft",
                  )}
                >
                  {entry.text}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <ol className="flex flex-col items-end gap-2.5 py-3 pr-4 pl-10 opacity-50">
          {entries.map((entry) => (
            <li key={entry.id} className="leading-none">
              <button
                type="button"
                aria-label={entry.text}
                onClick={() => jumpTo(entry.id)}
                className="flex h-3 items-center"
              >
                <span
                  className={cn(
                    "block h-0.5 rounded-full bg-current",
                    active === entry.id
                      ? "w-5 opacity-100"
                      : entry.level === Math.min(...entries.map((e) => e.level))
                        ? "w-3 opacity-40"
                        : "w-2 opacity-30",
                  )}
                />
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}

/**
 * Phone: a bottom sheet opened from the dock, within thumb reach. The current
 * section is marked and scrolled into view.
 */
export function ReaderTocSheet({
  entries,
  active,
  percent,
  open,
  onClose,
  className,
}: {
  entries: TocEntry[];
  active: string | null;
  percent: number;
  open: boolean;
  onClose: () => void;
  className?: string;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    activeRef.current?.scrollIntoView({ block: "center" });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || entries.length === 0) return null;

  return (
    <div className={cn("fixed inset-0 z-50", className)}>
      <button
        type="button"
        aria-label="Close contents"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Contents"
        className="absolute inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-surface px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink shadow-device"
      >
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-line" aria-hidden="true" />
        <p className="flex items-center justify-between px-2 pb-1.5 font-sans text-[13px] font-medium text-ink-soft">
          <span>Contents</span>
          <span className="tabular-nums">{percent}% read</span>
        </p>
        <ol>
          {entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                ref={active === entry.id ? activeRef : undefined}
                onClick={() => {
                  jumpTo(entry.id);
                  onClose();
                }}
                aria-current={active === entry.id ? "location" : undefined}
                style={{ paddingLeft: indentOf(entries, entry, 1, 0.75) }}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl py-2 pr-3 text-left font-sans text-[15px] leading-snug",
                  active === entry.id ? "bg-paper-warm font-semibold" : "text-ink-soft",
                )}
              >
                <span>{entry.text}</span>
                {active === entry.id ? (
                  <span className="shrink-0 text-[11px] font-medium text-ink-muted">Reading</span>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
