import { useEffect, useState } from "react";
import { ViewTransition } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { BookOpen, Clock3, Highlighter, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { useLibraryStore } from "@/lib/store.ts";
import { Hanko, WashiTag } from "@/components/kami.tsx";
import { previewImageSrc } from "@/lib/image-url.ts";
import { relativeTime } from "@/lib/time.ts";
import type { LibraryItem } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

const VIRTUALIZE_AFTER = 50;

function useLaneCount(): number {
  const [lanes, setLanes] = useState(() =>
    typeof window === "undefined" ? 3 : window.innerWidth >= 1280 ? 3 : window.innerWidth >= 768 ? 2 : 1,
  );
  useEffect(() => {
    const xl = window.matchMedia("(min-width: 1280px)");
    const md = window.matchMedia("(min-width: 768px)");
    const update = () => setLanes(xl.matches ? 3 : md.matches ? 2 : 1);
    update();
    xl.addEventListener("change", update);
    md.addEventListener("change", update);
    return () => {
      xl.removeEventListener("change", update);
      md.removeEventListener("change", update);
    };
  }, []);
  return lanes;
}

export function ArticleList({
  items,
  emptyTitle,
  emptyCopy,
  onOpen,
  onRemove,
  selectMode,
  selectedIds,
  onToggleSelect,
}: {
  items: LibraryItem[];
  emptyTitle: string;
  emptyCopy: string;
  onOpen: (item: LibraryItem) => void;
  onRemove: (id: string) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const lanes = useLaneCount();

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

  if (items.length > VIRTUALIZE_AFTER) {
    return (
      <VirtualGrid
        items={items}
        lanes={lanes}
        onOpen={onOpen}
        onRemove={onRemove}
        selectMode={selectMode}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
      />
    );
  }

  return (
    <ul
      id="library-article-list"
      className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
    >
      {items.map((item) => (
        <ViewTransition key={item.id} default="none">
          <ArticleCard
            item={item}
            onOpen={onOpen}
            onRemove={onRemove}
            selectMode={selectMode}
            selected={selectedIds?.has(item.id) ?? false}
            onToggleSelect={onToggleSelect}
          />
        </ViewTransition>
      ))}
    </ul>
  );
}

/** Window-scrolled, row-chunked grid for large libraries. Rows are measured
 *  live so uneven card heights stay aligned per row. */
function VirtualGrid({
  items,
  lanes,
  onOpen,
  onRemove,
  selectMode,
  selectedIds,
  onToggleSelect,
}: {
  items: LibraryItem[];
  lanes: number;
  onOpen: (item: LibraryItem) => void;
  onRemove: (id: string) => void;
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const rows: LibraryItem[][] = [];
  for (let i = 0; i < items.length; i += lanes) rows.push(items.slice(i, i + lanes));

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 420,
    overscan: 2,
    getItemKey: (index) => rows[index]![0]!.id,
  });

  return (
    <div
      id="library-article-list"
      style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
    >
      {virtualizer.getVirtualItems().map((vi) => {
        const row = rows[vi.index]!;
        return (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start}px)`,
            }}
          >
            <ul
              className="grid grid-cols-1 gap-6 pb-6 md:grid-cols-2 xl:grid-cols-3"
              style={{ gridTemplateColumns: `repeat(${lanes}, minmax(0, 1fr))` }}
            >
              {row.map((item) => (
                <ArticleCard
                  key={item.id}
                  item={item}
                  onOpen={onOpen}
                  onRemove={onRemove}
                  selectMode={selectMode}
                  selected={selectedIds?.has(item.id) ?? false}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ArticleCard({
  item,
  onOpen,
  onRemove,
  selectMode,
  selected,
  onToggleSelect,
}: {
  item: LibraryItem;
  onOpen: (item: LibraryItem) => void;
  onRemove: (id: string) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
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
    <li
      className={cn(
        "group kami-sheet relative flex min-h-full flex-col justify-between overflow-hidden p-4 transition-shadow duration-300 hover:shadow-[var(--shadow-border-hover)] sm:p-6",
        selected && "ring-2 ring-hanko/50",
      )}
    >
      {item.favorited ? (
        <span
          className="absolute top-0 right-6 h-8 w-3.5 rounded-b-[0.25rem] bg-hanko shadow-sm"
          aria-hidden="true"
        />
      ) : null}
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          {selectMode ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={`Select ${item.title}`}
              onClick={() => onToggleSelect?.(item.id)}
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-[0.25rem] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40 sm:size-8",
                selected ? "border-hanko bg-hanko text-white" : "border-faint bg-surface text-transparent",
              )}
            >
              <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
                <path d="M2 6.5 4.8 9 10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
          <WashiTag tone="paper">
            {item.source === "x" ? "X" : item.siteName || "Article"}
          </WashiTag>
        </span>
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
        onClick={() => (selectMode ? onToggleSelect?.(item.id) : onOpen(item))}
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

      <div className="-mx-4 -mb-4 flex items-center justify-between gap-2 bg-bg/60 px-4 py-3 sm:-mx-6 sm:-mb-6 sm:px-6">
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

      {!selectMode ? (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute right-2 bottom-14 size-11 text-ink-muted hover:text-hanko sm:size-8",
            "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100",
          )}
          aria-label={`Remove ${item.title}`}
          onClick={removeWithUndo}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}
