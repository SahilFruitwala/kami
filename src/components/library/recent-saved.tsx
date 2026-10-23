import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { BookSpine } from "@/components/gloss/book.tsx";
import { Shelf, type ShelfGroup } from "@/components/gloss/shelf.tsx";
import { minutesLabel } from "@/lib/gloss/format.ts";
import { topicOf } from "@/lib/gloss/palette.ts";
import type { LibraryItem } from "@/lib/library-item.ts";
import { useLibraryStore } from "@/lib/store.ts";

const SHOWN = 12;

/**
 * Your newest unread saves, standing on a shelf under the capture box. Reads
 * the library store Home already has (it boots in the background), so it
 * adds no request of its own; it renders nothing until there is a save.
 */
export function RecentSaved({ onOpen }: { onOpen: (item: LibraryItem) => void }) {
  const library = useLibraryStore((s) => s.library);
  const groups = useMemo<ShelfGroup<LibraryItem>[]>(
    () => [
      {
        id: "recent",
        items: library
          .filter((i) => !i.archived)
          .sort((a, b) => b.savedAt - a.savedAt)
          .slice(0, SHOWN),
      },
    ],
    [library],
  );

  if (groups[0]!.items.length === 0) return null;

  return (
    <section aria-labelledby="recent-heading" className="mt-16 w-full">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 id="recent-heading" className="font-display text-[28px] leading-tight tracking-tight">
          On your shelf
        </h2>
        <Link
          to="/library"
          className="font-sans text-sm text-ink-muted transition-colors hover:text-persimmon focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          See all in Library
        </Link>
      </div>
      <Shelf<LibraryItem>
        ariaLabel="Recently saved"
        groups={groups}
        getId={(it) => it.id}
        animateKey="home"
        renderSpine={(it) => <BookSpine item={it} topic={topicOf(it)} />}
        tooltip={(it) => ({
          title: it.title,
          sub: [it.author || it.siteName, minutesLabel(it.readingMinutes)]
            .filter(Boolean)
            .join(", "),
          label: `${it.title}${it.author ? ` by ${it.author}` : ""}, ${minutesLabel(it.readingMinutes)}`,
        })}
        onPick={onOpen}
      />
    </section>
  );
}
