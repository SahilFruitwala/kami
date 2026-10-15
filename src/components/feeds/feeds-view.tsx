import { useMemo, useState } from "react";
import {
  BookOpen,
  BookmarkPlus,
  Check,
  CheckCheck,
  ExternalLink,
  LoaderCircle,
  Mail,
  PencilLine,
  RefreshCcw,
  Rss,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Hanko } from "@/components/kami.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  AddFeedForm,
  FeedList,
  NewsletterCard,
  OpmlTools,
} from "@/components/feeds/feeds-sidebar.tsx";
import { EntrySummary } from "@/components/feeds/feed-ai.tsx";
import { useAiStatus } from "@/hooks/use-ai.ts";
import { useFeedActions, useFeedEntries, useFeedsOverview } from "@/hooks/use-feeds.ts";
import type { FeedEntry, FeedEntryView, FeedSummary } from "@/lib/api/feeds";
import { previewImageSrc } from "@/lib/image-url.ts";
import type { LibraryItem } from "@/lib/store.ts";
import { relativeTime } from "@/lib/time.ts";
import { cn } from "@/lib/utils.ts";

const VIEWS: Array<{ id: FeedEntryView; label: string }> = [
  { id: "unread", label: "Unread" },
  { id: "all", label: "All" },
  { id: "saved", label: "Saved" },
];

export function FeedsView({
  feedId,
  view,
  onSelectFeed,
  onView,
  onOpenItem,
}: {
  feedId: string | null;
  view: FeedEntryView;
  onSelectFeed: (id: string | null) => void;
  onView: (view: FeedEntryView) => void;
  onOpenItem: (item: LibraryItem) => void;
}) {
  const overview = useFeedsOverview();
  const feeds = useMemo(() => overview.data?.feeds ?? [], [overview.data]);
  const hasFeeds = feeds.length > 0;
  const actions = useFeedActions();
  const selected = feedId ? (feeds.find((f) => f.id === feedId) ?? null) : null;
  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[18.5rem_minmax(0,1fr)] xl:gap-10">
      <aside className="flex flex-col gap-6 lg:sticky lg:top-24">
        <section className="kami-sheet space-y-5 p-4">
          <AddFeedForm actions={actions} />
          {hasFeeds ? <FeedList feeds={feeds} selected={feedId} onSelect={onSelectFeed} /> : null}
        </section>
        {overview.data ? <NewsletterCard inbox={overview.data.inbox} actions={actions} /> : null}
        <OpmlTools actions={actions} />
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        {overview.isPending ? (
          <EntrySkeleton />
        ) : !hasFeeds ? (
          <EmptyFeeds />
        ) : (
          <>
            <FeedHeader
              feed={selected}
              lastRefreshed={lastRefreshed(feeds)}
              actions={actions}
              onUnsubscribed={() => onSelectFeed(null)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="group" aria-label="Entry views" className="g-seg g-seg--sm">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={view === v.id}
                    onClick={() => onView(v.id)}
                  >
                    {v.label}
                    {v.id === "unread" ? (
                      <span className="tabular-nums text-ink-muted">
                        {selected ? selected.unread : feeds.reduce((n, f) => n + f.unread, 0)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <ToolbarButton
                  onClick={() =>
                    actions.refresh.mutate(selected?.kind === "rss" ? selected.id : null)
                  }
                  busy={actions.refresh.isPending}
                  disabled={selected?.kind === "email"}
                  title={
                    selected?.kind === "email"
                      ? "Newsletters arrive by email — nothing to fetch"
                      : selected
                        ? "Fetch new entries for this feed"
                        : "Fetch new entries for every feed"
                  }
                  icon={<RefreshCcw className="size-3.5" aria-hidden="true" />}
                >
                  {selected ? "Refresh feed" : "Refresh all"}
                </ToolbarButton>
                <ToolbarButton
                  onClick={() => {
                    const scope = selected ? `“${selected.title}”` : "every feed";
                    if (window.confirm(`Mark everything in ${scope} as read?`)) {
                      actions.markAllRead.mutate(feedId);
                    }
                  }}
                  busy={actions.markAllRead.isPending}
                  icon={<CheckCheck className="size-3.5" aria-hidden="true" />}
                >
                  Mark all read
                </ToolbarButton>
              </div>
            </div>
            <EntryList
              key={`${view}:${feedId ?? "all"}`}
              view={view}
              feedId={feedId}
              actions={actions}
              onOpenItem={onOpenItem}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  busy,
  disabled,
  title,
  icon,
  children,
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={busy || disabled}
      className="flex h-8 items-center gap-1.5 rounded-full px-3 font-sans text-[13px] text-ink-soft transition-colors hover:bg-paper-warm hover:text-ink disabled:opacity-60"
    >
      {busy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

/** Most recent check across RSS feeds (newsletters arrive on their own). */
function lastRefreshed(feeds: FeedSummary[]): number | null {
  let latest: number | null = null;
  for (const f of feeds) {
    if (f.kind === "rss" && f.lastFetchedAt && (latest === null || f.lastFetchedAt > latest)) {
      latest = f.lastFetchedAt;
    }
  }
  return latest;
}

function FeedHeader({
  feed,
  lastRefreshed,
  actions,
  onUnsubscribed,
}: {
  feed: FeedSummary | null;
  lastRefreshed: number | null;
  actions: ReturnType<typeof useFeedActions>;
  onUnsubscribed: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");

  if (!feed) {
    return (
      <div>
        <h3 className="font-display text-3xl tracking-tight text-ink">All feeds</h3>
        <p className="mt-1 font-body text-sm text-ink-soft">
          Fresh entries from everything you follow. Save one to read it in the reader and highlight
          it like any other work.
        </p>
        <p className="mt-1.5 font-sans text-xs text-ink-muted">
          Feeds update when you press Refresh
          {lastRefreshed ? ` · last checked ${relativeTime(lastRefreshed)}` : ""}.
        </p>
      </div>
    );
  }

  const site = feed.siteUrl ?? feed.url;
  return (
    <div className="space-y-1.5">
      {renaming ? (
        <form
          className="flex max-w-md items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            actions.rename.mutate({ id: feed.id, title: draft.trim() || null });
            setRenaming(false);
          }}
        >
          <Input
            autoFocus
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
            aria-label="Feed name"
            className="h-9"
          />
          <button type="submit" className="g-btn g-btn--ink h-9">
            Save
          </button>
        </form>
      ) : (
        <h3 className="flex items-center gap-2 font-display text-3xl tracking-tight text-ink">
          {feed.kind === "email" ? (
            <Mail className="size-5 text-ink-muted" aria-hidden="true" />
          ) : (
            <Rss className="size-5 text-ink-muted" aria-hidden="true" />
          )}
          <span className="min-w-0 truncate">{feed.title}</span>
        </h3>
      )}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-xs text-ink-muted">
        {site ? (
          <a
            href={site}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 underline-offset-2 hover:text-hanko hover:underline"
          >
            {hostOf(site)}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
        {feed.lastFetchedAt ? (
          <span>
            {feed.kind === "email" ? "Last issue" : "Checked"} {relativeTime(feed.lastFetchedAt)}
          </span>
        ) : feed.kind === "rss" ? (
          <span>Not fetched yet — press Refresh feed</span>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setDraft(feed.title);
            setRenaming(true);
          }}
          className="flex items-center gap-1 hover:text-hanko"
        >
          <PencilLine className="size-3" aria-hidden="true" />
          Rename
        </button>
        <button
          type="button"
          onClick={() => {
            const note =
              feed.kind === "email"
                ? " New issues will still arrive unless you also unsubscribe from the newsletter itself."
                : "";
            if (window.confirm(`Unsubscribe from “${feed.title}”?${note}`)) {
              actions.remove.mutate(feed.id, { onSuccess: onUnsubscribed });
            }
          }}
          className="flex items-center gap-1 hover:text-hanko"
        >
          <Trash2 className="size-3" aria-hidden="true" />
          {feed.kind === "email" ? "Remove sender" : "Unsubscribe"}
        </button>
      </p>
      {feed.lastError ? (
        <p className="rounded-md bg-shu-tint px-3 py-2 font-sans text-xs text-hanko">
          This feed is failing: {feed.lastError} KAMI keeps retrying with growing gaps.
        </p>
      ) : null}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function EntryList({
  view,
  feedId,
  actions,
  onOpenItem,
}: {
  view: FeedEntryView;
  feedId: string | null;
  actions: ReturnType<typeof useFeedActions>;
  onOpenItem: (item: LibraryItem) => void;
}) {
  const query = useFeedEntries(view, feedId);
  const entries = useMemo(() => query.data?.pages.flatMap((p) => p.entries) ?? [], [query.data]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const ai = useAiStatus();

  if (query.isPending) return <EntrySkeleton />;
  if (query.isError) {
    return (
      <div className="kami-sheet p-8 text-center font-body text-sm text-ink-muted">
        Couldn't load entries.{" "}
        <button type="button" onClick={() => void query.refetch()} className="text-hanko underline">
          Try again
        </button>
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="kami-sheet flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Hanko glyph="済" className="size-11 text-lg" />
        <p className="font-display text-2xl text-ink-soft italic">
          {view === "unread"
            ? "All caught up"
            : view === "saved"
              ? "Nothing saved yet"
              : "No entries yet"}
        </p>
        <p className="max-w-sm font-body text-sm leading-relaxed text-ink-muted">
          {view === "unread"
            ? "New posts land here as your feeds publish them."
            : view === "saved"
              ? "Entries you save to the library are listed here."
              : "Entries appear after the first check of this feed."}
        </p>
      </div>
    );
  }

  function run(entry: FeedEntry, open: boolean) {
    setPendingId(entry.id);
    actions.save.mutate(entry, {
      onSuccess: (item) => {
        if (open) onOpenItem(item);
      },
      onSettled: () => setPendingId(null),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            busy={pendingId === entry.id}
            showFeed={!feedId}
            canSummarize={ai.enabled}
            onRead={() => run(entry, true)}
            onSave={() => run(entry, false)}
            onDismiss={() => actions.markRead.mutate([entry.id])}
          />
        ))}
      </ul>
      {query.hasNextPage ? (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="mx-auto flex items-center gap-1.5 rounded-md bg-surface px-4 py-2 font-sans text-xs text-ink-soft shadow-[var(--shadow-border)] hover:text-ink disabled:opacity-60"
        >
          {query.isFetchingNextPage ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          Load more
        </button>
      ) : null}
    </div>
  );
}

function EntryCard({
  entry,
  busy,
  showFeed,
  canSummarize,
  onRead,
  onSave,
  onDismiss,
}: {
  entry: FeedEntry;
  busy: boolean;
  showFeed: boolean;
  canSummarize: boolean;
  onRead: () => void;
  onSave: () => void;
  onDismiss: () => void;
}) {
  const read = entry.state !== null;
  const [summaryOpen, setSummaryOpen] = useState(false);
  return (
    <li
      id={`feed-entry-${entry.id}`}
      className={cn(
        "kami-sheet group flex scroll-mt-24 gap-4 p-4 transition-shadow hover:shadow-[var(--shadow-border-hover)] sm:p-5",
        read && "opacity-70",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 font-sans text-[11px] text-ink-muted">
          {!read ? <span className="size-1.5 rounded-full bg-hanko" aria-label="Unread" /> : null}
          {showFeed ? (
            <span className="max-w-48 truncate font-medium text-ink-soft">{entry.feedTitle}</span>
          ) : null}
          {showFeed ? <span aria-hidden="true">·</span> : null}
          <time dateTime={new Date(entry.publishedAt).toISOString()} className="tabular-nums">
            {relativeTime(entry.publishedAt)}
          </time>
          {entry.author ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="max-w-40 truncate">{entry.author}</span>
            </>
          ) : null}
          {entry.state === "saved" ? (
            <span className="ml-1 rounded bg-bamboo-wash px-1.5 py-px text-[10px] font-medium text-bamboo">
              In library
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={onRead}
          disabled={busy}
          className="mt-1.5 block text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
        >
          <span className="line-clamp-2 font-display text-lg leading-snug font-medium break-words text-ink transition-colors group-hover:text-hanko">
            {entry.title}
          </span>
        </button>
        {entry.excerpt ? (
          <p className="mt-1.5 line-clamp-2 font-body text-sm leading-relaxed break-words text-ink-soft">
            {entry.excerpt}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <EntryAction onClick={onRead} disabled={busy}>
            {busy ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <BookOpen className="size-3.5" aria-hidden="true" />
            )}
            Read
          </EntryAction>
          {entry.state !== "saved" ? (
            <EntryAction onClick={onSave} disabled={busy}>
              <BookmarkPlus className="size-3.5" aria-hidden="true" />
              Save to library
            </EntryAction>
          ) : null}
          {entry.url ? (
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 font-sans text-[11px] text-ink-muted transition-colors hover:text-ink"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Original
            </a>
          ) : null}
          {!read ? (
            <EntryAction onClick={onDismiss}>
              <Check className="size-3.5" aria-hidden="true" />
              Mark read
            </EntryAction>
          ) : null}
          {canSummarize ? (
            <EntryAction onClick={() => setSummaryOpen((v) => !v)}>
              <Sparkles className="size-3.5" aria-hidden="true" />
              {summaryOpen ? "Hide summary" : "Summary"}
            </EntryAction>
          ) : null}
        </div>
        {summaryOpen ? <EntrySummary entryId={entry.id} /> : null}
      </div>
      {entry.imageUrl ? (
        <img
          src={previewImageSrc(entry.imageUrl)}
          alt=""
          width="112"
          height="80"
          loading="lazy"
          decoding="async"
          className="hidden h-20 w-28 shrink-0 rounded-lg object-cover sm:block"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </li>
  );
}

function EntryAction({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 font-sans text-[11px] text-ink-muted transition-colors hover:text-ink disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function EntrySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="kami-sheet h-28 animate-pulse p-5 opacity-60" />
      ))}
    </div>
  );
}

function EmptyFeeds() {
  return (
    <div className="kami-sheet flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Hanko glyph="報" className="size-12 text-xl" />
      <p className="font-display text-2xl text-ink-soft italic">Your morning post is empty</p>
      <p className="max-w-md font-body text-sm leading-relaxed text-ink-muted">
        Follow blogs, Substacks and newsletters — paste any site's address on the left and KAMI
        finds its feed. New posts gather here; save the good ones to read, highlight and keep.
      </p>
    </div>
  );
}
