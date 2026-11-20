import { Cover, mins } from "@/components/home/today-desk.tsx";
import type { LibraryItem } from "@/lib/library-item.ts";

/** Front-loaded cascade: early covers spread out, later ones bunch up, capped at ~260ms. */
const delay = (i: number) => `${Math.round(Math.sqrt(Math.min(i, 16)) * 65)}ms`;

/**
 * Library as a wall of covers: titles readable at a glance, real hero images,
 * reading time underneath. Covers that are already on screen never replay
 * their entrance when filters change; only newcomers fade in.
 */
export function CoverGrid({
  items,
  onOpen,
}: {
  items: LibraryItem[];
  onOpen: (item: LibraryItem) => void;
}) {
  return (
    <ul className="rd-lib-grid" role="list">
      {items.map((item, i) => (
        <li
          key={item.id}
          className="rd-lib-card rd-enter"
          style={{ "--enter-delay": delay(i) } as React.CSSProperties}
        >
          <button type="button" className="rd-lib-open" onClick={() => onOpen(item)}>
            <Cover item={item} />
            <h5>{item.title}</h5>
            <span className="rd-sub">
              <span>{item.author || item.siteName}</span>
              <span>
                {item.highlights.length ? `${item.highlights.length} ✎ · ` : ""}
                {mins(item.readingMinutes)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
