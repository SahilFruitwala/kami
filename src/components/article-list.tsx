import { ViewTransition } from "react";
import { BookOpen, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { previewImageSrc } from "@/lib/image-url.ts";
import { relativeTime } from "@/lib/time.ts";
import type { LibraryItem } from "@/lib/store.ts";

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
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <BookOpen className="size-7 text-faint" aria-hidden="true" />
        <p className="font-display text-2xl text-ink-soft italic">{emptyTitle}</p>
        <p className="max-w-sm text-sm leading-normal text-ink-muted">{emptyCopy}</p>
      </div>
    );
  }

  return (
    <ul id="library-article-list" className="divide-y divide-line">
      {items.map((item) => (
        <ViewTransition key={item.id} default="none">
          <ArticleRow item={item} onOpen={onOpen} onRemove={onRemove} />
        </ViewTransition>
      ))}
    </ul>
  );
}

function ArticleRow({
  item,
  onOpen,
  onRemove,
}: {
  item: LibraryItem;
  onOpen: (item: LibraryItem) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="group py-4">
      <article className="flex items-stretch gap-3 sm:gap-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 text-left sm:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 rounded-lg"
          onClick={() => onOpen(item)}
        >
          {item.heroImage ? (
            <ViewTransition name={`article-image-${item.id}`} share="morph" default="none">
              <img
                src={previewImageSrc(item.heroImage)}
                alt=""
                width={80}
                height={80}
                loading="lazy"
                decoding="async"
                className="mt-0.5 size-16 shrink-0 rounded-md object-cover shadow-border sm:size-20"
              />
            </ViewTransition>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-paper-warm px-2 py-0.5 text-xs font-semibold text-ink shadow-xs">
                {item.source === "x" ? "X" : item.siteName || "Article"}
              </span>
              <span className="text-xs font-medium text-ink-muted tabular-nums">
                {item.readingMinutes} min · {relativeTime(item.savedAt)}
              </span>
            </span>
            <span className="mt-1.5 flex items-start gap-2">
              <ViewTransition name={`article-title-${item.id}`} share="text-morph" default="none">
                <h2 className="min-w-0 flex-1 font-display text-xl font-medium leading-snug tracking-tight text-ink">
                  {item.title}
                </h2>
              </ViewTransition>
              {item.favorited ? (
                <span className="mt-1 inline-flex shrink-0 items-center">
                  <Star className="size-4 fill-ink text-ink" aria-hidden="true" />
                  <span className="sr-only">(favorited)</span>
                </span>
              ) : null}
            </span>
            {item.excerpt ? (
              <span className="mt-1 line-clamp-2 block text-sm leading-normal text-ink-soft">
                {item.excerpt}
              </span>
            ) : null}
            {item.tags?.length || item.highlights?.length ? (
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                {(item.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-paper-warm px-2.5 py-0.5 text-xs font-medium text-ink shadow-xs"
                  >
                    #{tag}
                  </span>
                ))}
                {item.highlights?.length ? (
                  <span className="text-xs font-medium text-ink-muted">
                    {item.highlights.length} highlight{item.highlights.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 self-start text-ink-muted hover:text-ink focus-visible:opacity-100 group-focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          aria-label={`Remove ${item.title}`}
          onClick={() => onRemove(item.id)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </article>
    </li>
  );
}
