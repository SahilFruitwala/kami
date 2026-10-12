import { useState, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";
import { dvdLook, familyVars, STATUS_DOT, vhsLook, shelfBookLook } from "@/lib/gloss/palette.ts";
import { Endpaper } from "@/components/gloss/book.tsx";
import { statusLabels, statusText } from "@/lib/shelf-labels.ts";
import type { ShelfCard } from "@/lib/shelves.ts";
import { cn } from "@/lib/utils.ts";
import { GlossCta, Ornament, type PullOutApi } from "@/components/gloss/index.ts";

/**
 * The video shelf: Movies are VHS tapes in cardboard rental sleeves, Series
 * are DVD keepcases (fatter box sets for long-running shows). Same Gloss
 * pull-out as books — the sleeve turns to its front and opens like a
 * clamshell to show the tape or the disc.
 */

export type MediaKind = "vhs" | "dvd" | "book";

function Poster({ src, className }: { src: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className={className}
    />
  );
}

function WatchedSticker({ size = 18 }: { size?: number }) {
  return (
    <span
      className="g-sticker"
      style={{ width: size, height: size, background: "#B8443A", color: "#fff" }}
      aria-hidden="true"
    >
      <Check style={{ width: size * 0.6, height: size * 0.6 }} strokeWidth={3} />
    </span>
  );
}

/* ——— VHS ——— */

export function VhsSpine({ item }: { item: ShelfCard }) {
  const look = vhsLook(item.id, item.title);
  const style = {
    width: look.width,
    height: look.height,
    "--sleeve": look.sleeve,
    "--sleeve-ink": look.ink,
    "--band": look.band,
  } as CSSProperties;
  return (
    <span
      className={cn("g-vhs-spine", item.status === "abandoned" && "opacity-60 saturate-50")}
      style={style}
      aria-hidden="true"
    >
      <span className="font-sans text-[8px] font-bold tabular-nums opacity-80">
        {item.year ?? ""}
      </span>
      <span className="g-vhs-band" />
      {look.sticker ? (
        <span
          className="g-sticker"
          style={{
            position: "relative",
            flexShrink: 0,
            marginTop: 4,
            width: look.width - 12,
            height: look.width - 12,
            background: look.stickerColor,
            color: "#1b1712",
            fontSize: 4.5,
            padding: 2,
            transform: `rotate(${(item.title.length % 5) * 7 - 14}deg)`,
          }}
        >
          {look.sticker}
        </span>
      ) : null}
      <span className="g-vhs-title min-h-0 flex-1 py-2" style={{ fontSize: look.titleSize }}>
        {item.title}
      </span>
      <span className="g-vhs-band !h-1.5" />
      <span className="g-vhs-logo mt-1.5">VHS</span>
      {item.status === "done" ? (
        <span className="absolute top-[30px] right-1">
          <WatchedSticker size={14} />
        </span>
      ) : null}
    </span>
  );
}

export function VhsSpineFace({ item }: { item: ShelfCard }) {
  const look = vhsLook(item.id, item.title);
  return (
    <span
      className="g-vhs-spine size-full"
      style={
        { "--sleeve": look.sleeve, "--sleeve-ink": look.ink, "--band": look.band } as CSSProperties
      }
    >
      <span className="g-vhs-band !h-[7%]" />
      <span className="g-vhs-title min-h-0 flex-1 py-[6%] text-[clamp(14px,3.6cqh,30px)]">
        {item.title}
      </span>
      <span className="g-vhs-logo mb-[4%] scale-[2]">VHS</span>
    </span>
  );
}

export function VhsSleeve({ item }: { item: ShelfCard }) {
  const look = vhsLook(item.id, item.title);
  return (
    <div
      className="g-sleeve"
      style={{ "--sleeve": look.sleeve, "--sleeve-ink": look.ink } as CSSProperties}
    >
      <div className="g-sleeve-fallback">
        <p className="font-sans text-[max(12px,8cqw)] leading-[0.95] font-extrabold uppercase">
          {item.title}
        </p>
        {item.year ? (
          <p className="mt-2 font-sans text-[max(10px,3.5cqw)] font-semibold opacity-70">
            {item.year}
          </p>
        ) : null}
      </div>
      <Poster src={item.imageUrl} className="top-[11cqw]! h-[calc(100%-11cqw)]!" />
      <div className="g-sleeve-band">
        <span className="g-vhs-logo !text-[max(8px,3.6cqw)]">VHS</span>
        <span className="font-sans text-[max(7px,2.6cqw)] font-bold tracking-[0.2em] uppercase opacity-80">
          Home video
        </span>
      </div>
      {item.status === "done" ? (
        <span className="absolute right-[5cqw] bottom-[5cqw] z-[2]">
          <WatchedSticker size={28} />
        </span>
      ) : null}
    </div>
  );
}

/** Inside of the clamshell: the cassette, with a hand-written label. */
export function VhsInside({ item, spinning }: { item: ShelfCard; spinning: boolean }) {
  // Tape on each reel tells you how far through it you are.
  const progress = item.status === "done" ? 1 : item.status === "in_progress" ? 0.5 : 0;
  const look = vhsLook(item.id, item.title);
  return (
    <div className="g-clam">
      {/* The sleeve art, seen through the clamshell's clear front. */}
      <InsideArt item={item} bg={look.sleeve} ink={look.ink} />
      <div className="g-cassette g-cassette--flat">
        <div className="g-cassette-label">{item.title}</div>
        <div className="g-cassette-window">
          <span
            className={cn("g-reel", spinning && "g-reel--spin")}
            style={{ "--tape": `${2 + (1 - progress) * 9}px` } as CSSProperties}
          />
          <span
            className={cn("g-reel", spinning && "g-reel--spin")}
            style={{ "--tape": `${2 + progress * 9}px` } as CSSProperties}
          />
        </div>
        <span className="absolute bottom-[5%] left-[6%] font-sans text-[9px] font-black tracking-wider text-white/40">
          VHS
        </span>
        <span className="absolute right-[6%] bottom-[5%] font-sans text-[9px] font-bold text-white/30">
          T-120
        </span>
      </div>
    </div>
  );
}

/** Poster filling the inside of a case, under a sheet of clear plastic. */
function InsideArt({ item, bg, ink }: { item: ShelfCard; bg: string; ink: string }) {
  return (
    <div className="g-inside-art" style={{ background: bg, color: ink }}>
      <div className="absolute inset-0 flex flex-col justify-start p-[8%]">
        <p className="font-sans text-[26px] leading-[0.95] font-extrabold uppercase">
          {item.title}
        </p>
        {item.year ? (
          <p className="mt-2 font-sans text-sm font-semibold opacity-70">{item.year}</p>
        ) : null}
      </div>
      <Poster src={item.imageUrl} />
    </div>
  );
}

/* ——— DVD ——— */

export function DvdSpine({ item }: { item: ShelfCard }) {
  const look = dvdLook(item.id, item.title, item.totalEpisodes);
  const pct =
    item.totalEpisodes && item.totalEpisodes > 0
      ? Math.min(1, (item.episodesWatched ?? 0) / item.totalEpisodes)
      : item.status === "done"
        ? 1
        : 0;
  const style = {
    width: look.width,
    height: look.height,
    "--case": look.case,
    "--case-ink": look.ink,
  } as CSSProperties;
  return (
    <span
      className={cn("g-dvd-spine", item.status === "abandoned" && "opacity-60 saturate-50")}
      style={style}
      aria-hidden="true"
    >
      <span className="g-dvd-logo">DVD</span>
      <span className="g-dvd-title min-h-0 flex-1 py-2" style={{ fontSize: look.titleSize }}>
        {item.title}
      </span>
      {look.discs > 1 ? (
        <span className="mb-1 flex gap-[3px]">
          {Array.from({ length: look.discs }).map((_, i) => (
            <span
              key={i}
              className="block size-[5px] rounded-full"
              style={{
                background: i < Math.round(pct * look.discs) ? "#E8C66A" : "rgba(255,255,255,0.25)",
              }}
            />
          ))}
        </span>
      ) : null}
      {/* Episode progress runs up the spine like a fill line. */}
      {pct > 0 && pct < 1 ? (
        <span
          className="absolute bottom-0 left-0 w-[2px] bg-[#E8C66A]"
          style={{ height: `${pct * 100}%` }}
        />
      ) : null}
      {item.status === "done" ? (
        <span className="mb-0.5">
          <WatchedSticker size={Math.min(14, look.width - 6)} />
        </span>
      ) : null}
    </span>
  );
}

export function DvdSpineFace({ item }: { item: ShelfCard }) {
  const look = dvdLook(item.id, item.title, item.totalEpisodes);
  return (
    <span
      className="g-dvd-spine size-full justify-center"
      style={{ "--case": look.case, "--case-ink": look.ink } as CSSProperties}
    >
      <span className="g-dvd-logo scale-[2.4] pb-3">DVD</span>
      <span className="g-dvd-title min-h-0 max-h-[78%] text-[clamp(13px,3.2cqh,26px)]">
        {item.title}
      </span>
    </span>
  );
}

export function DvdCase({ item }: { item: ShelfCard }) {
  const look = dvdLook(item.id, item.title, item.totalEpisodes);
  return (
    // Container on a wrapper: the case's own padding is in cqw, which can't
    // resolve against the element it sits on.
    <div className="size-full" style={{ containerType: "inline-size" }}>
      <div className="g-case" style={{ "--case": look.case } as CSSProperties}>
        <div className="g-case-insert">
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-br from-[#2b2f3a] to-[#0c0d10] p-[8cqw] text-white">
            <p className="font-sans text-[max(13px,8cqw)] leading-tight font-bold">{item.title}</p>
            {item.subtitle ? (
              <p className="mt-1 font-sans text-[max(10px,3.6cqw)] opacity-70">{item.subtitle}</p>
            ) : null}
          </div>
          <Poster src={item.imageUrl} />
          <div className="g-case-band">
            <span className="text-[max(8px,4cqw)] font-black italic tracking-tight">DVD</span>
            <span className="text-[max(6px,2.4cqw)] font-semibold tracking-[0.2em] uppercase opacity-75">
              {look.discs > 1 ? `${look.discs}-disc set` : "Video"}
            </span>
          </div>
          {item.status === "done" ? (
            <span className="absolute right-[5cqw] bottom-[5cqw] z-[2]">
              <WatchedSticker size={28} />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Inside the keepcase: the disc on its hub, printed with the poster. */
export function DvdInside({ item, spinning }: { item: ShelfCard; spinning: boolean }) {
  const look = dvdLook(item.id, item.title, item.totalEpisodes);
  return (
    <div className="g-tray" style={{ "--case": look.case } as CSSProperties}>
      {/* Cover insert seen through the clear sleeve, disc resting on the hub. */}
      <InsideArt item={item} bg="#15161a" ink="#f2f2f2" />
      <div className={cn("g-disc g-disc--tucked", spinning && "g-disc--spin")}>
        <div className="g-disc-label" style={{ "--case": look.case } as CSSProperties}>
          <Poster src={item.imageUrl} />
        </div>
      </div>
      <span className="g-disc-caption">
        {look.discs > 1 ? `Disc 1 of ${look.discs}` : "Disc 1"}
      </span>
    </div>
  );
}

/* ——— Books on the shelf ——— */

export function ShelfBookSpine({ item }: { item: ShelfCard }) {
  const look = shelfBookLook(item);
  const pct = Math.min(100, Math.max(0, item.progressPercent ?? 0));
  return (
    <span
      className={cn("g-book-spine", item.status === "abandoned" && "opacity-60 saturate-50")}
      style={
        {
          width: look.width,
          height: look.height,
          "--spine": look.color,
          "--spine-ink": look.ink,
          "--spine-dark": look.fam.dark,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <span className="flex h-full w-full flex-col items-center justify-between pt-[22px] pb-[22px]">
        <span className="h-3" />
        <span
          className={cn(
            "g-spine-title min-h-0 max-h-[68%] shrink px-0.5",
            look.italic ? "font-display text-[14px] italic" : "font-display text-[13.5px]",
          )}
        >
          {item.title}
        </span>
        {item.status === "done" ? (
          <WatchedSticker size={Math.min(14, look.width - 6)} />
        ) : (
          <span className="font-sans text-[8px] font-semibold tracking-[0.12em] uppercase opacity-60">
            {(item.subtitle ?? "").split(/\s+/).pop()?.slice(0, 7)}
          </span>
        )}
      </span>
      {item.status === "in_progress" && pct > 0 && pct < 100 ? (
        <span
          className="absolute bottom-0 left-0 w-[2px] bg-[#E8C66A]"
          style={{ height: `${pct}%` }}
        />
      ) : null}
    </span>
  );
}

export function ShelfBookSpineFace({ item }: { item: ShelfCard }) {
  const look = shelfBookLook(item);
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

export function ShelfBookCover({ item }: { item: ShelfCard }) {
  const look = shelfBookLook(item);
  return (
    <div className="g-cover" style={familyVars(look.fam) as CSSProperties}>
      {item.imageUrl ? (
        <div className="absolute inset-0 bg-[var(--cover)]">
          <Poster src={item.imageUrl} className="size-full object-cover" />
        </div>
      ) : null}
      <div className="g-cover-frame" />
      {!item.imageUrl ? (
        <>
          <p className="g-cover-meta" style={{ marginTop: "14cqw" }}>
            {item.year ?? "Book"}
          </p>
          <p className="g-cover-title">{item.title}</p>
          {item.subtitle ? <p className="g-cover-author">{item.subtitle}</p> : null}
        </>
      ) : null}
      {item.status === "done" ? (
        <span className="absolute right-[5cqw] bottom-[5cqw] z-[2]">
          <WatchedSticker size={28} />
        </span>
      ) : null}
    </div>
  );
}

export function ShelfBookInside({ item, number }: { item: ShelfCard; number: number }) {
  return (
    <Endpaper
      topic={shelfBookLook(item).topic}
      number={number}
      shelvedAt={item.createdAt}
      owner="Your copy"
    />
  );
}

/* ——— Right page ——— */

export function MediaPage({
  api,
  item,
  kind,
  loading,
  busy,
  onOpenDetails,
  onToggleDone,
}: {
  api: PullOutApi;
  item: ShelfCard;
  kind: MediaKind;
  loading: boolean;
  busy: boolean;
  onOpenDetails: () => void;
  onToggleDone: () => void;
}) {
  const labels = statusLabels(kind === "vhs" ? "movie" : kind === "dvd" ? "tv" : "book");
  const isDone = item.status === "done";
  const eps = item.totalEpisodes ?? 0;
  const watched = item.episodesWatched ?? 0;
  const isBook = kind === "book";
  const pct = Math.min(100, Math.max(0, item.progressPercent ?? 0));
  const statusLine =
    item.status === "done"
      ? item.completedAt
        ? `${isBook ? "Finished" : "Watched"} ${new Date(item.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
        : isBook
          ? "Finished"
          : "Watched"
      : item.status === "in_progress"
        ? isBook
          ? `Reading${pct ? ` · ${pct}% read` : ""}`
          : `Watching${item.lastEpisode ? ` · last ${item.lastEpisode}` : ""}`
        : item.status === "abandoned"
          ? isBook
            ? "Set aside"
            : "Dropped"
          : isBook
            ? "Not read yet"
            : "Not watched yet";

  const rows: { key: string; node: ReactNode; className?: string }[] = [
    {
      key: "chips",
      node: (
        <div className="flex flex-wrap items-center gap-2 font-sans text-[13px] text-ink-muted">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line px-2.5 font-medium text-ink">
            <span
              className="size-1.5 rounded-full"
              style={{ background: STATUS_DOT[item.status] }}
              aria-hidden="true"
            />
            {statusText(labels, item.status)}
          </span>
          {item.year ? <span>{item.year}</span> : null}
          <span aria-hidden="true">·</span>
          <span>
            {kind === "book"
              ? "Book"
              : kind === "vhs"
                ? "VHS"
                : eps
                  ? `DVD · ${eps} episodes`
                  : "DVD"}
          </span>
        </div>
      ),
    },
    {
      key: "title",
      node: (
        <h2 className="mt-4 font-display text-[clamp(22px,6.4cqw,30px)] leading-[1.15] text-ink">
          {item.title}
        </h2>
      ),
    },
    ...(item.subtitle && item.subtitle !== String(item.year ?? "")
      ? [
          {
            key: "sub",
            node: (
              <p className="mt-2 font-display text-[17px] italic text-ink-soft">{item.subtitle}</p>
            ),
          },
        ]
      : []),
    {
      key: "orn",
      node: (
        <div className="mt-4">
          <Ornament />
        </div>
      ),
    },
    ...(item.overview
      ? [
          {
            key: "over",
            node: (
              <p className="mt-4 line-clamp-5 font-display text-[16px] leading-[1.5] text-ink-soft">
                {item.overview}
              </p>
            ),
          },
        ]
      : []),
    ...(isBook && item.status !== "done" && pct > 0
      ? [
          {
            key: "pages",
            node: (
              <div className="mt-5">
                <div className="flex justify-between font-sans text-[12px] text-ink-muted tabular-nums">
                  <span>Progress</span>
                  <span>{pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-warm">
                  <div
                    className="h-full rounded-full bg-ink transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ),
          },
        ]
      : []),
    ...(kind === "dvd" && eps > 0
      ? [
          {
            key: "eps",
            node: (
              <div className="mt-5">
                <div className="flex justify-between font-sans text-[12px] text-ink-muted tabular-nums">
                  <span>Episodes</span>
                  <span>
                    {watched} / {eps}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-warm">
                  <div
                    className="h-full rounded-full bg-ink transition-[width] duration-300"
                    style={{ width: `${Math.min(100, (watched / eps) * 100)}%` }}
                  />
                </div>
              </div>
            ),
          },
        ]
      : []),
    {
      key: "div",
      className: "mt-auto",
      node: (
        <div className="pt-5">
          <div className="h-px bg-line" />
          <p className="mt-3 font-sans text-[13px] text-ink-muted">{statusLine}</p>
        </div>
      ),
    },
    {
      key: "cta",
      node: (
        <div className="mt-3">
          <GlossCta
            loading={loading}
            loadingLabel={
              kind === "vhs" ? "Rewinding…" : kind === "dvd" ? "Loading disc…" : "Turning pages…"
            }
            onClick={onOpenDetails}
          >
            {kind === "vhs"
              ? "Open the tape"
              : kind === "dvd"
                ? "Open the box set"
                : "Open the book"}
          </GlossCta>
        </div>
      ),
    },
    {
      key: "foot",
      node: (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 font-sans text-[13px] text-ink-muted">
          <button
            type="button"
            disabled={busy}
            onClick={onToggleDone}
            aria-pressed={isDone}
            className="inline-flex items-center gap-1.5 hover:text-ink disabled:opacity-50"
          >
            <Check className={cn("size-4", isDone && "text-[#B8443A]")} aria-hidden="true" />
            {isDone ? labels.markTry : labels.markDone}
          </button>
          <button
            type="button"
            onClick={api.close}
            className="flex items-center gap-2 hover:text-ink"
          >
            Put it back <kbd className="g-kbd">Esc</kbd>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="g-page-scroll" style={{ containerType: "inline-size" }}>
      <div
        className="g-reveal flex min-h-full flex-col p-[clamp(18px,7cqw,36px)]"
        data-on={api.revealed === true ? "true" : api.revealed === "out" ? "out" : "false"}
      >
        {rows.map((r, n) => (
          <div key={r.key} className={r.className} style={{ "--n": n } as CSSProperties}>
            {r.node}
          </div>
        ))}
      </div>
    </div>
  );
}
