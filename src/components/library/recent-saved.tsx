import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { relativeTime } from "@/lib/time.ts";
import type { LibraryItem } from "@/lib/library-item.ts";
import { useLibraryStore } from "@/lib/store.ts";

const SHOWN = 3;

/**
 * The three most recent unread saves, as rows under the capture box. Reads
 * the library store Home already has (it boots in the background), so it
 * adds no request of its own; it renders nothing until there is a save.
 */
export function RecentSaved({ onOpen }: { onOpen: (item: LibraryItem) => void }) {
  const library = useLibraryStore((s) => s.library);
  const recent = useMemo(
    () =>
      library
        .filter((i) => !i.archived)
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, SHOWN),
    [library],
  );

  if (recent.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="mt-16 w-full">
      <div className="flex items-baseline justify-between">
        <h2 id="recent-heading" className="font-display text-[28px] leading-tight tracking-tight">
          Recently saved
        </h2>
        <Link
          to="/library"
          className="font-sans text-sm text-ink-muted transition-colors hover:text-persimmon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          See all in Library
        </Link>
      </div>
      <ul className="g-stagger mt-3">
        {recent.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="kami-row group w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            >
              <span className="min-w-0">
                <span className="block font-display text-[22px] leading-snug tracking-tight text-ink transition-colors group-hover:text-persimmon">
                  {item.title}
                </span>
                {item.excerpt ? (
                  <span className="mt-1 line-clamp-2 block max-w-[58ch] font-body text-[15px] leading-relaxed text-ink-soft">
                    {item.excerpt}
                  </span>
                ) : null}
                <span className="mt-2 flex gap-3.5 font-sans text-[13px] text-ink-muted">
                  <span>{item.siteName || (item.source === "x" ? "X" : "Article")}</span>
                  <span>{item.readingMinutes} min</span>
                  <span>{relativeTime(item.savedAt)}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
