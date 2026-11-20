import { Link } from "@tanstack/react-router";
import { useMemo, type CSSProperties } from "react";
import { useDeskStats } from "@/hooks/use-desk-stats.ts";
import { hashString, topicOf } from "@/lib/gloss/palette.ts";
import { previewImageSrc } from "@/lib/image-url.ts";
import type { LibraryItem } from "@/lib/library-item.ts";
import { useLibraryStore } from "@/lib/store.ts";

const COVER_HUES = [
  ["#3b4aa0", "#1f275c"],
  ["#b5532c", "#6a2812"],
  ["#4f7d58", "#22402a"],
  ["#874166", "#3e1930"],
  ["#c08a45", "#6e4a1e"],
  ["#3a3631", "#141210"],
  ["#2f7a83", "#123b41"],
  ["#6b4fa3", "#2e1f52"],
];

export function coverStyle(seed: string): CSSProperties {
  const [a, b] = COVER_HUES[hashString(seed) % COVER_HUES.length]!;
  return { background: `linear-gradient(160deg, ${a}, ${b})` };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);
const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** A book cover made from the article: hero image under a colour wash, title set in Fraunces. */
export function Cover({ item, size = "md" }: { item: LibraryItem; size?: "md" | "lg" }) {
  const topic = topicOf(item);
  return (
    <div className={`rd-cover rd-cover--${size}`} style={coverStyle(topic + item.id)}>
      {item.heroImage ? (
        <img className="rd-cover-img" src={previewImageSrc(item.heroImage)} alt="" loading="lazy" />
      ) : null}
      <small>{topic === "unsorted" ? item.siteName || "Article" : cap(topic)}</small>
      <h4>{item.title}</h4>
      <span>{item.author || item.siteName}</span>
    </div>
  );
}

const read = (item: LibraryItem) => ({ to: "/read" as const, search: { id: item.id } });

/** Entrance order for the page; non-uniform gaps read as one settling motion. */
export const enter = (ms: number) => ({ "--enter-delay": `${ms}ms` }) as CSSProperties;

export function TodayDate({ waiting }: { waiting: number }) {
  const now = new Date();
  return (
    <div className="rd-date">
      <b>{now.getDate()}</b>
      {now.toLocaleDateString(undefined, { weekday: "long", month: "long" })}
      <br />
      {waiting} {waiting === 1 ? "piece" : "pieces"} waiting
    </div>
  );
}

/** Everything below the capture bar on Today: lead piece, queue, stats, recent covers. */
export function TodayDesk() {
  const library = useLibraryStore((s) => s.library);
  const stats = useDeskStats();
  const inbox = useMemo(
    () => library.filter((i) => !i.archived).sort((a, b) => b.savedAt - a.savedAt),
    [library],
  );
  const lead = inbox[0];
  const queue = inbox.slice(1, 5);
  const weekAgo = Date.now() - 7 * 864e5;
  const savedWeek = library.filter((i) => i.savedAt >= weekAgo).length;
  const queuedMinutes = inbox.reduce((n, i) => n + (i.readingMinutes || 0), 0);
  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, k) => {
      const s = start.getTime() - (6 - k) * 864e5;
      return library.some((i) => i.savedAt >= s && i.savedAt < s + 864e5);
    });
  }, [library]);

  if (!lead) {
    return (
      <p className="rd-empty rd-enter" style={enter(140)}>
        Nothing saved yet. Paste a link above and it lands here.
      </p>
    );
  }

  return (
    <>
      <div className="rd-grid-home">
        <article className="rd-card rd-continue rd-enter" style={enter(140)}>
          <Link {...read(lead)} className="rd-cover-link" tabIndex={-1} aria-hidden="true">
            <Cover item={lead} size="lg" />
          </Link>
          <div className="rd-continue-body">
            <p className="rd-eyebrow">Newest on your desk · {mins(lead.readingMinutes)}</p>
            <h3>{lead.title}</h3>
            {lead.excerpt ? <p className="rd-excerpt">{lead.excerpt}</p> : null}
            <div className="rd-row rd-actions">
              <Link {...read(lead)} className="rd-btn rd-btn-ink">
                Start reading
              </Link>
              <span className="rd-muted">
                {lead.author || lead.siteName} · saved {shortDate(lead.savedAt)}
              </span>
            </div>
          </div>
        </article>

        <aside className="rd-card rd-queue rd-enter" style={enter(190)}>
          <div className="rd-row rd-between">
            <h2 className="rd-h2 rd-h2--sm">Up next</h2>
            <span className="rd-muted">~{mins(queuedMinutes)} on the desk</span>
          </div>
          {queue.length === 0 ? <p className="rd-muted rd-pad">That's everything.</p> : null}
          {queue.map((item, i) => (
            <Link key={item.id} {...read(item)} className="rd-queue-item">
              <span className="rd-n">{i + 1}</span>
              <div>
                <b>{item.title}</b>
                <small>
                  {item.author || item.siteName} · {mins(item.readingMinutes)}
                </small>
              </div>
              <span className="rd-pill">{cap(topicOf(item))}</span>
            </Link>
          ))}
        </aside>
      </div>

      <div className="rd-stats rd-enter" style={enter(240)}>
        <div className="rd-card rd-stat">
          <b>{stats.inbox}</b>
          <span>on your desk</span>
        </div>
        <div className="rd-card rd-stat">
          <b>{savedWeek}</b>
          <span>saved this week</span>
        </div>
        <div className="rd-card rd-stat">
          <b>{stats.vaultCount}</b>
          <span>highlights kept</span>
        </div>
        <div className="rd-card rd-stat">
          <span>Saving streak · last 7 days</span>
          <div className="rd-streak">
            {days.map((on, k) => (
              <i key={k} className={on ? "on" : ""} />
            ))}
          </div>
        </div>
      </div>

      <section className="rd-enter" style={enter(280)} aria-labelledby="shelf-heading">
        <div className="rd-section-head">
          <h2 id="shelf-heading" className="rd-h2">
            On your shelf
          </h2>
          <Link to="/library" className="rd-link">
            See all {inbox.length} →
          </Link>
        </div>
        <div className="rd-covers-row">
          {inbox.slice(0, 6).map((item, i) => (
            <Link
              key={item.id}
              {...read(item)}
              className="rd-cover-link rd-enter"
              style={enter(300 + [0, 40, 70, 95, 115, 130][i]!)}
            >
              <Cover item={item} />
              <p className="rd-meta">{mins(item.readingMinutes)}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
