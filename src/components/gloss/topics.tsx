import type { CSSProperties } from "react";
import { ArrowLeft, Star } from "lucide-react";
import {
  bookSpineLook,
  familyVars,
  topicBlurb,
  topicFamily,
  topicLabel,
  type TopicId,
} from "@/lib/gloss/palette.ts";
import type { LibraryItem } from "@/lib/library-item.ts";
import { BookCover, TopicEngraving, TopicIcon } from "@/components/gloss/book.tsx";
import { useTilt } from "@/hooks/use-tilt.ts";
import { minutesLabel } from "@/lib/gloss/format.ts";

export type TopicBucket = { topic: TopicId; items: LibraryItem[] };

function totalMinutes(items: LibraryItem[]): number {
  return items.reduce((n, it) => n + (it.readingMinutes || 0), 0);
}

/** 3-column grid of topic cards; each card's mini shelf grows in. */
export function TopicsGrid({
  buckets,
  onOpen,
}: {
  buckets: TopicBucket[];
  onOpen: (topic: TopicId) => void;
}) {
  if (buckets.length === 0) {
    return (
      <p className="py-16 text-center font-display text-2xl italic text-ink-muted">
        Nothing on the shelves yet.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {buckets.map((b, i) => (
        <TopicCard key={b.topic} bucket={b} index={i} onOpen={() => onOpen(b.topic)} />
      ))}
    </div>
  );
}

function TopicCard({
  bucket,
  index,
  onOpen,
}: {
  bucket: TopicBucket;
  index: number;
  onOpen: () => void;
}) {
  const fam = topicFamily(bucket.topic);
  const bars = bucket.items.slice(0, 26);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="g-topic-card"
      style={{ ...familyVars(fam), "--i": index } as CSSProperties}
    >
      <div className="aspect-[440/240] w-full overflow-hidden">
        <div className="g-topic-art size-full">
          <TopicEngraving topic={bucket.topic} seed="card" />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p
          className="flex items-center gap-2 font-display text-[26px] leading-tight"
          style={{ color: fam.dark }}
        >
          <TopicIcon topic={bucket.topic} className="size-5" />
          {topicLabel(bucket.topic, bucket.items[0]?.tags)}
        </p>
        <p
          className="mt-1 font-sans text-[13px]"
          style={{ color: `color-mix(in srgb, ${fam.dark} 70%, transparent)` }}
        >
          {bucket.items.length} piece{bucket.items.length === 1 ? "" : "s"} ·{" "}
          {minutesLabel(totalMinutes(bucket.items))}
        </p>
        <div
          className="mt-5 flex h-12 items-end gap-[2px] border-b-2"
          style={{ borderColor: fam.light }}
          aria-hidden="true"
        >
          {bars.map((it, b) => {
            const look = bookSpineLook(it, bucket.topic);
            return (
              <span
                key={it.id}
                className="g-bar block rounded-t-[1px]"
                style={
                  {
                    width: Math.max(4, look.width / 5),
                    height: `${Math.round((look.height / 250) * 100)}%`,
                    background: look.color,
                    "--b": b,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>
      </div>
    </button>
  );
}

/** Topic page: big header, then front-facing covers with hover tilt. */
export function TopicPage({
  topic,
  items,
  onBack,
  onPick,
}: {
  topic: TopicId;
  items: LibraryItem[];
  onBack: () => void;
  onPick: (item: LibraryItem) => void;
}) {
  const fam = topicFamily(topic);
  const tilt = useTilt();
  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All tags
      </button>
      <div className="grid items-center gap-8 md:grid-cols-[1fr_minmax(0,420px)]">
        <div className="g-fade-late [animation-delay:0ms]">
          <h2 className="g-h1-topic flex items-center gap-4" style={{ color: fam.dark }}>
            <TopicIcon topic={topic} className="size-10" />
            {topicLabel(topic, items[0]?.tags)}
          </h2>
          <p className="mt-4 max-w-md font-display text-xl leading-snug text-ink-soft">
            {topicBlurb(topic)}
          </p>
          <p className="mt-3 font-sans text-[15px] text-ink-muted">
            <span className="font-medium text-ink">{items.length}</span> piece
            {items.length === 1 ? "" : "s"} ·{" "}
            <span className="font-medium text-ink">{minutesLabel(totalMinutes(items))}</span> of
            reading
          </p>
        </div>
        <div
          className="aspect-[420/240] overflow-hidden rounded-[20px]"
          style={familyVars(fam) as CSSProperties}
        >
          <TopicEngraving topic={topic} seed="hero" iconScale={0.8} />
        </div>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((it, i) => (
          <div
            key={it.id}
            className="g-topic-card !bg-transparent !shadow-none"
            style={{ "--i": Math.min(i, 16) } as CSSProperties}
          >
            <button
              type="button"
              className="g-tilt aspect-[245/345]"
              data-gloss-id={it.id}
              aria-label={`${it.title}${it.author ? ` by ${it.author}` : ""}`}
              onClick={() => onPick(it)}
              {...tilt}
            >
              <BookCover item={it} topic={topic} />
            </button>
            <p className="mt-2.5 flex items-center gap-2 font-sans text-[13px] text-ink-muted">
              {minutesLabel(it.readingMinutes)}
              {it.archived ? <span className="text-ink">· Read</span> : null}
              {it.favorited ? (
                <Star className="size-3.5 fill-current text-[#c99a2e]" aria-label="Favorite" />
              ) : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
