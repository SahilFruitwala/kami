import { useEffect, useRef, useState, type RefObject } from "react";
import { ListTree } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
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
function useActiveHeading(entries: TocEntry[]) {
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

export function ReaderToc({ entries }: { entries: TocEntry[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active = useActiveHeading(open ? entries : []);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (entries.length === 0) return null;

  const minLevel = Math.min(...entries.map((e) => e.level));

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Table of contents"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <ListTree className="size-4" aria-hidden="true" />
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-label="Table of contents"
          className="screen-scroll fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top))] z-40 max-h-[calc(100dvh-5rem-env(safe-area-inset-top))] overflow-y-auto rounded-xl border border-line bg-surface p-2 shadow-device sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[70vh] sm:w-80"
        >
          <p className="px-2 pt-1 pb-1.5 text-[13px] font-medium text-ink-soft">Contents</p>
          <ol>
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => jump(entry.id)}
                  aria-current={active === entry.id ? "location" : undefined}
                  style={{ paddingLeft: `${0.5 + (entry.level - minLevel) * 0.875}rem` }}
                  className={cn(
                    "block min-h-11 w-full rounded-lg py-2 pr-2 text-left font-sans text-sm leading-snug transition-colors hover:bg-paper-warm/60 sm:min-h-0 sm:py-1.5",
                    active === entry.id ? "bg-paper-warm font-semibold text-hanko" : "text-ink",
                  )}
                >
                  {entry.text}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
