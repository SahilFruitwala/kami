import { useState, type CSSProperties, type ReactNode } from "react";
import { Star } from "lucide-react";
import { previewImageSrc } from "@/lib/image-url.ts";
import {
  bookSpineLook,
  familyVars,
  seeded,
  TOPIC_FAMILIES,
  TOPIC_LABELS,
  type TopicId,
} from "@/lib/gloss/palette.ts";
import { minutesLabel, domainOf } from "@/lib/gloss/format.ts";
import { TOPIC_ICONS } from "@/lib/gloss/topic-icons.ts";
import type { LibraryItem } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";
import { GlossCta, Ornament, type PullOutApi } from "@/components/gloss/index.ts";

export function TopicIcon({ topic, className }: { topic: TopicId; className?: string }) {
  const Icon = TOPIC_ICONS[topic];
  return <Icon className={cn("size-3.5", className)} strokeWidth={1.8} aria-hidden="true" />;
}

/* ——— Spine ——— */

export function BookSpine({ item, topic }: { item: LibraryItem; topic: TopicId }) {
  const look = bookSpineLook(item, topic);
  const style = {
    width: look.width,
    height: look.height,
    "--spine": look.color,
    "--spine-ink": look.ink,
    "--spine-dark": TOPIC_FAMILIES[topic].dark,
  } as CSSProperties;
  const titleClass =
    look.titleStyle === "caps"
      ? "font-sans text-[10.5px] font-semibold uppercase tracking-[0.14em]"
      : look.titleStyle === "italic"
        ? "font-display text-[14px] italic"
        : "font-display text-[13.5px]";
  return (
    <span className="g-book-spine" style={style} aria-hidden="true">
      {look.ribbon ? <span className="g-ribbon" style={{ right: 6 }} /> : null}
      <span className="flex h-full w-full flex-col items-center justify-between pt-[22px] pb-[22px]">
        {look.mark ? (
          <TopicIcon topic={topic} className="size-3 shrink-0 opacity-70" />
        ) : (
          <span className="h-3" />
        )}
        {look.label ? (
          <span
            className="g-spine-label mx-[3px] max-h-[62%] min-h-0 shrink"
            style={{ width: look.width - 8 }}
          >
            <span className={cn("g-spine-title max-h-full", titleClass)}>{item.title}</span>
          </span>
        ) : (
          <span className={cn("g-spine-title min-h-0 max-h-[68%] shrink px-0.5", titleClass)}>
            {item.title}
          </span>
        )}
        <span className="font-sans text-[8px] font-semibold tracking-[0.12em] uppercase opacity-60">
          {(item.author || item.siteName || "").split(/\s+/).pop()?.slice(0, 7)}
        </span>
      </span>
    </span>
  );
}

/** Spine face for the 3D book (fills its parent). */
export function BookSpineFace({ item, topic }: { item: LibraryItem; topic: TopicId }) {
  const look = bookSpineLook(item, topic);
  return (
    <span
      className="g-book-spine size-full justify-center"
      style={{ "--spine": look.color, "--spine-ink": look.ink } as CSSProperties}
    >
      <span className="g-spine-title max-h-[80%] font-display text-[clamp(12px,4.5cqh,22px)]">
        {item.title}
      </span>
    </span>
  );
}

/** A small stack of lying books, decoration at the end of a filtered shelf. */
export function LyingBooks({ topic, seed }: { topic: TopicId; seed: string }) {
  const fam = TOPIC_FAMILIES[topic];
  const rand = seeded(seed);
  const shades = [fam.dark, fam.mid, fam.light, fam.mid];
  return (
    <span className="g-lying" aria-hidden="true">
      {shades.map((c, i) => (
        <span
          key={i}
          style={{
            background: c,
            width: 120 + Math.round(rand() * 40),
            marginLeft: Math.round(rand() * 14),
            height: 14 + Math.round(rand() * 6),
          }}
        />
      ))}
    </span>
  );
}

/* ——— Cover ——— */

function CoverArt({ item, topic }: { item: LibraryItem; topic: TopicId }) {
  const src = item.heroImage ? previewImageSrc(item.heroImage) : null;
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <div className="g-cover-art">
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      </div>
    );
  }
  return (
    <div className="g-cover-art g-cover-art--plain">
      <TopicEngraving topic={topic} seed={item.id} />
    </div>
  );
}

export function BookCover({ item, topic }: { item: LibraryItem; topic: TopicId }) {
  const fam = TOPIC_FAMILIES[topic];
  const year = new Date(item.published ?? item.savedAt).getFullYear();
  return (
    <div className="g-cover" style={familyVars(fam) as CSSProperties}>
      <div className="g-cover-frame" />
      <CoverArt item={item} topic={topic} />
      <p className="g-cover-meta">
        {TOPIC_LABELS[topic]} {Number.isFinite(year) ? year : ""}
      </p>
      <p className="g-cover-title">{item.title}</p>
      {item.author ? <p className="g-cover-author">{item.author}</p> : null}
    </div>
  );
}

/* ——— Engraving-style illustration (no bespoke art needed) ——— */

export function TopicEngraving({
  topic,
  seed,
  className,
  iconScale = 1,
}: {
  topic: TopicId;
  seed: string;
  className?: string;
  iconScale?: number;
}) {
  const fam = TOPIC_FAMILIES[topic];
  const rand = seeded(`${topic}:${seed}`);
  const pid = `h-${topic}-${seed.replace(/[^a-z0-9]/gi, "").slice(0, 10)}`;
  const sunX = 70 + rand() * 260;
  const sunY = 40 + rand() * 40;
  const hill = (base: number, amp: number) => {
    const a = rand() * 40;
    const b = rand() * 40;
    return `M0 ${base} C ${100 + a} ${base - amp}, ${180 + b} ${base + amp / 3}, 260 ${base - amp / 2} S 360 ${base - amp}, 400 ${base - amp / 3} L400 220 L0 220Z`;
  };
  const Icon = TOPIC_ICONS[topic];
  return (
    <div
      className={cn("g-art relative size-full overflow-hidden", className)}
      style={{ color: fam.dark }}
    >
      <svg
        viewBox="0 0 400 220"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id={`${pid}-a`}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-30)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="5"
              stroke="currentColor"
              strokeWidth="1.1"
              opacity="0.55"
            />
          </pattern>
          <pattern
            id={`${pid}-b`}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(40)"
          >
            <line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="1" opacity="0.8" />
          </pattern>
        </defs>
        {Array.from({ length: 7 }).map((_, i) => (
          <circle
            key={i}
            cx={sunX}
            cy={sunY}
            r={10 + i * 9}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
            opacity={0.5 - i * 0.06}
          />
        ))}
        <circle cx={sunX} cy={sunY} r="10" fill="currentColor" opacity="0.85" />
        <path d={hill(150, 40)} fill={`url(#${pid}-a)`} stroke="currentColor" strokeWidth="1" />
        <path d={hill(185, 30)} fill={`url(#${pid}-b)`} stroke="currentColor" strokeWidth="1" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className="flex items-center justify-center rounded-full"
          style={{
            width: `${34 * iconScale}%`,
            aspectRatio: "1",
            background: "var(--g-cream)",
            boxShadow: `0 0 0 1.5px ${fam.dark}, 0 0 0 6px var(--g-cream), 0 0 0 7px ${fam.dark}`,
          }}
        >
          <Icon className="size-[48%]" strokeWidth={1.3} aria-hidden="true" />
        </span>
      </span>
    </div>
  );
}

/* ——— Inside: endpaper + Ex Libris ——— */

export function Endpaper({
  topic,
  number,
  shelvedAt,
  owner,
}: {
  topic: TopicId;
  number: number;
  shelvedAt: number;
  owner: string;
}) {
  const fam = TOPIC_FAMILIES[topic];
  const date = new Date(shelvedAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <div className="g-endpaper" style={familyVars(fam) as CSSProperties}>
      <div className="g-plate">
        <p className="g-caps text-[11px] tracking-[0.32em]" style={{ color: fam.dark }}>
          Ex Libris
        </p>
        <div className="my-3 flex justify-center" style={{ color: fam.dark }}>
          <svg
            width="64"
            height="18"
            viewBox="0 0 64 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            aria-hidden="true"
          >
            <path d="M2 9h18M44 9h18" />
            <path d="M32 2c4 3 4 11 0 14-4-3-4-11 0-14Z" fill="currentColor" fillOpacity=".15" />
            <circle cx="24" cy="9" r="1.6" fill="currentColor" />
            <circle cx="40" cy="9" r="1.6" fill="currentColor" />
          </svg>
        </div>
        <p className="font-display text-xl italic">{owner}</p>
        <p className="mt-2 font-sans text-[11px] text-[#7a7365] tabular-nums">
          No. {number} · shelved {date}
        </p>
      </div>
    </div>
  );
}

/* ——— Right page ——— */

export function BookPage({
  api,
  item,
  topic,
  onRead,
  onToggleFavorite,
  onToggleArchive,
}: {
  api: PullOutApi;
  item: LibraryItem;
  topic: TopicId;
  onRead: () => void;
  onToggleFavorite: () => void;
  onToggleArchive: () => void;
}) {
  const fam = TOPIC_FAMILIES[topic];
  const [loading, setLoading] = useState(false);
  const year = new Date(item.published ?? item.savedAt).getFullYear();
  const domain = domainOf(item.canonicalUrl || item.url);
  const extraTags = (item.tags ?? []).filter((t) => t.toLowerCase() !== topic).slice(0, 3);
  const hl = item.highlights?.length ?? 0;
  const progress = item.archived
    ? "Finished"
    : hl > 0
      ? `In progress · ${hl} highlight${hl === 1 ? "" : "s"}`
      : "Not started";

  const children: ReactNode[] = [
    <div
      key="chips"
      className="flex flex-wrap items-center gap-2 font-sans text-[13px] text-ink-muted"
    >
      <span
        className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-medium"
        style={{ background: fam.tint, color: fam.dark }}
      >
        <TopicIcon topic={topic} className="size-3" />
        {TOPIC_LABELS[topic]}
      </span>
      {Number.isFinite(year) ? <span>{year}</span> : null}
      <span aria-hidden="true">·</span>
      <span>{minutesLabel(item.readingMinutes)}</span>
    </div>,
    <h2
      key="title"
      className="mt-4 font-display text-[clamp(22px,6.4cqw,30px)] leading-[1.15] text-ink"
    >
      {item.title}
    </h2>,
    item.author || item.siteName ? (
      <p key="author" className="mt-2 font-display text-[17px] italic text-ink-soft">
        {item.author || item.siteName}
      </p>
    ) : null,
    <div key="orn" className="mt-4">
      <Ornament color={fam.mid} />
    </div>,
    item.excerpt ? (
      <p
        key="sum"
        className="mt-4 line-clamp-4 font-display text-[16px] leading-[1.5] text-ink-soft"
      >
        {item.excerpt}
      </p>
    ) : null,
    extraTags.length ? (
      <div key="tags" className="mt-4 flex flex-wrap gap-1.5">
        {extraTags.map((t) => (
          <span
            key={t}
            className="inline-flex h-6 items-center rounded-full border border-line px-2.5 font-sans text-xs text-ink-soft"
          >
            {t}
          </span>
        ))}
      </div>
    ) : null,
    <div key="div" className="pt-5">
      <div className="h-px bg-line" />
      <p className="mt-3 font-sans text-[13px] text-ink-muted">{progress}</p>
    </div>,
    <div key="cta" className="mt-3">
      <GlossCta
        loading={loading}
        loadingLabel="Bringing it in"
        onClick={() => {
          setLoading(true);
          window.setTimeout(() => api.dissolve(onRead), 320);
        }}
      >
        Read in Kami
      </GlossCta>
    </div>,
    <div
      key="foot"
      className="mt-4 flex flex-wrap items-center justify-between gap-2 font-sans text-[13px] text-ink-muted"
    >
      <span className="flex items-center gap-3">
        {domain ? (
          <a
            href={item.canonicalUrl || item.url}
            target="_blank"
            rel="noreferrer"
            className="truncate hover:text-ink"
          >
            {domain} ↗
          </a>
        ) : null}
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={item.favorited}
          aria-label={item.favorited ? "Remove from favorites" : "Add to favorites"}
          className="flex size-7 items-center justify-center rounded-full hover:bg-paper-warm hover:text-ink"
        >
          <Star
            className={cn("size-4", item.favorited && "fill-current text-[#c99a2e]")}
            aria-hidden="true"
          />
        </button>
        <button type="button" onClick={onToggleArchive} className="hover:text-ink">
          {item.archived ? "Unarchive" : "Archive"}
        </button>
      </span>
      <button type="button" onClick={api.close} className="flex items-center gap-2 hover:text-ink">
        Put it back <kbd className="g-kbd">Esc</kbd>
      </button>
    </div>,
  ].filter(Boolean);

  return (
    <div className="g-page-scroll" style={{ containerType: "inline-size" }}>
      <div
        className="g-reveal flex min-h-full flex-col p-[clamp(18px,7cqw,36px)]"
        data-on={api.revealed === true ? "true" : api.revealed === "out" ? "out" : "false"}
      >
        {children.map((c, n) => (
          <div
            key={n}
            style={{ "--n": n } as CSSProperties}
            className={(c as { key?: string }).key === "div" ? "mt-auto" : undefined}
          >
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}
