import { ViewTransition } from "react";
import { BookOpen, Clock3, Highlighter, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { useLibraryStore } from "@/lib/store.ts";
import { Hanko, WashiTag } from "@/components/kami.tsx";
import { previewImageSrc } from "@/lib/image-url.ts";
import { relativeTime } from "@/lib/time.ts";
import type { LibraryItem } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

export function ArticleList({
  items,
  emptyTitle,
  emptyCopy,
  onOpen,
  onRemove,
}: {
  items: LibraryItem[];
  emptyTitle: string;
  emptyCopy: string;
  onOpen: (item: LibraryItem) => void;
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="kami-sheet flex flex-col items-center gap-3 px-6 py-16 text-center">
        <BookOpen className="size-6 text-ink-muted" aria-hidden="true" />
        <p className="font-display text-2xl text-ink-soft italic">{emptyTitle}</p>
        <p className="max-w-sm font-body text-sm leading-relaxed text-ink-muted">
          {emptyCopy}
        </p>
      </div>
    );
  }

  return (
    <ul
      id="library-article-list"
      className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
    >
      {items.map((item) => (
        <ViewTransition key={item.id} default="none">
          <ArticleCard item={item} onOpen={onOpen} onRemove={onRemove} />
        </ViewTransition>
      ))}
    </ul>
  );
}

function ArticleCard({
  item,
  onOpen,
  onRemove,
}: {
  item: LibraryItem;
  onOpen: (item: LibraryItem) => void;
  onRemove: (id: string) => void;
}) {
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const glyph = (item.siteName || item.title || "K").trim().charAt(0) || "K";

  function removeWithUndo() {
    const snapshot = item;
    onRemove(item.id);
    toast.success(`Removed “${snapshot.title.slice(0, 40)}”`, {
      action: { label: "Undo", onClick: () => upsertItem(snapshot) },
    });
  }
  return (
    <li className="group kami-sheet relative flex min-h-full flex-col justify-between overflow-hidden p-6 transition-shadow duration-300 hover:shadow-[var(--shadow-border-hover)]">
      {item.favorited ? (
        <span
          className="absolute top-0 right-6 h-8 w-3.5 rounded-b-[0.25rem] bg-hanko shadow-sm"
          aria-hidden="true"
        />
      ) : null}
      <div className="mb-4 flex items-center justify-between gap-2">
        <WashiTag tone="paper">
          {item.source === "x" ? "X" : item.siteName || "Article"}
        </WashiTag>
        {item.highlights?.length ? (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-hanko">
            <Highlighter className="size-3.5" aria-hidden="true" />
            {item.highlights.length} saved
          </span>
        ) : item.archived ? (
          <span className="text-[11px] font-medium text-ink-muted">Archived</span>
        ) : (
          <span className="text-[11px] font-medium text-ink-muted">Unread</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onOpen(item)}
        className="mb-4 flex flex-1 flex-col rounded-[0.25rem] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
      >
        <ViewTransition name={`article-title-${item.id}`} share="text-morph" default="none">
          <span className="line-clamp-2 font-display text-xl leading-snug font-medium break-words text-ink transition-colors group-hover:text-hanko">
            {item.title}
          </span>
        </ViewTransition>
        {item.excerpt ? (
          <span className="mt-2 line-clamp-3 font-body text-sm leading-relaxed break-words text-ink-soft">
            {item.excerpt}
          </span>
        ) : null}
        {item.heroImage ? (
          <span className="mt-4 block h-32 w-full overflow-hidden rounded-[0.25rem]">
            <ViewTransition name={`article-image-${item.id}`} share="morph" default="none">
              <img
                src={previewImageSrc(item.heroImage)}
                alt=""
                width="800"
                height="450"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </ViewTransition>
          </span>
        ) : null}
      </button>

      <div className="-mx-6 -mb-6 flex items-center justify-between gap-2 bg-bg/60 px-6 py-3">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-ink-muted">
          <Hanko glyph={glyph} square className="size-5 text-[10px]" />
          <span className="truncate">{item.author || item.siteName || "Unknown hand"}</span>
        </p>
        <p className="flex shrink-0 items-center gap-2 text-[11px] font-medium text-ink-muted">
          <span className="flex items-center gap-1 tabular-nums">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {item.readingMinutes}&nbsp;min
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{relativeTime(item.savedAt)}</span>
          {item.favorited ? (
            <Star className="size-3.5 fill-hanko text-hanko" aria-label="Favorited" />
          ) : null}
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute right-2 bottom-14 size-8 text-ink-muted hover:text-hanko",
          "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
        )}
        aria-label={`Remove ${item.title}`}
        onClick={removeWithUndo}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}
