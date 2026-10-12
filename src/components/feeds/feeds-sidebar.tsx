import { useRef, useState } from "react";
import {
  AlertCircle,
  Copy,
  Download,
  Inbox,
  LoaderCircle,
  Mail,
  Plus,
  RefreshCcw,
  Rss,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input.tsx";
import type { useFeedActions } from "@/hooks/use-feeds.ts";
import { feedsApi, type FeedSummary, type NewsletterInbox } from "@/lib/api/feeds";
import { cn } from "@/lib/utils.ts";

type Actions = ReturnType<typeof useFeedActions>;

export function AddFeedForm({ actions }: { actions: Actions }) {
  const [url, setUrl] = useState("");
  const busy = actions.add.isPending;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = url.trim();
        if (!value || busy) return;
        actions.add.mutate(value, { onSuccess: () => setUrl("") });
      }}
    >
      <label htmlFor="feed-url" className="kami-label block text-ink-muted">
        Follow a site or feed
      </label>
      <div className="flex gap-2">
        <Input
          id="feed-url"
          name="feed-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Site or feed URL"
          className="h-9 bg-bg/70"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          aria-label="Follow"
          className="flex h-9 shrink-0 items-center gap-1 rounded-lg bg-hanko px-3 font-sans text-xs font-semibold text-paper shadow-sm transition-colors hover:bg-shu disabled:opacity-50"
        >
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          Follow
        </button>
      </div>
      <p className="font-body text-[11px] leading-snug text-ink-muted">
        Blogs, Substack, YouTube channels, podcasts — anything with RSS or Atom.
      </p>
    </form>
  );
}

export function FeedList({
  feeds,
  selected,
  onSelect,
}: {
  feeds: FeedSummary[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const total = feeds.reduce((n, f) => n + f.unread, 0);
  const rss = feeds.filter((f) => f.kind === "rss");
  const mail = feeds.filter((f) => f.kind === "email");
  return (
    <nav aria-label="Feeds" className="space-y-4">
      <FeedRow
        active={selected === null}
        icon={<Inbox className="size-4" aria-hidden="true" />}
        title="All feeds"
        unread={total}
        onClick={() => onSelect(null)}
      />
      {rss.length > 0 ? (
        <FeedGroup label="Following">
          {rss.map((f) => (
            <FeedRow
              key={f.id}
              active={selected === f.id}
              icon={<Rss className="size-3.5" aria-hidden="true" />}
              title={f.title}
              unread={f.unread}
              error={f.lastError}
              onClick={() => onSelect(f.id)}
            />
          ))}
        </FeedGroup>
      ) : null}
      {mail.length > 0 ? (
        <FeedGroup label="Newsletters">
          {mail.map((f) => (
            <FeedRow
              key={f.id}
              active={selected === f.id}
              icon={<Mail className="size-3.5" aria-hidden="true" />}
              title={f.title}
              unread={f.unread}
              onClick={() => onSelect(f.id)}
            />
          ))}
        </FeedGroup>
      ) : null}
    </nav>
  );
}

function FeedGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="kami-label mb-1.5 px-2 text-ink-muted">{label}</p>
      <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">{children}</ul>
    </div>
  );
}

function FeedRow({
  active,
  icon,
  title,
  unread,
  error,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  unread: number;
  error?: string | null;
  onClick: () => void;
}) {
  return (
    <li className="list-none">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
          active ? "bg-shu-tint text-hanko" : "text-ink hover:bg-paper-warm",
        )}
      >
        <span className={cn("shrink-0", active ? "text-hanko" : "text-ink-muted")}>{icon}</span>
        <span className="min-w-0 flex-1 truncate font-sans text-[13px]">{title}</span>
        {error ? (
          <AlertCircle className="size-3.5 shrink-0 text-danger" aria-label={`Failing: ${error}`}>
            <title>{error}</title>
          </AlertCircle>
        ) : null}
        {unread > 0 ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 font-sans text-[10px] font-semibold tabular-nums",
              active ? "bg-hanko text-paper" : "bg-bg text-ink-soft",
            )}
          >
            {unread > 999 ? "999+" : unread}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function NewsletterCard({ inbox, actions }: { inbox: NewsletterInbox; actions: Actions }) {
  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <section className="space-y-2.5 rounded-lg bg-shu-tint p-4" aria-label="Newsletter address">
      <p className="kami-label flex items-center gap-1.5 text-hanko">
        <Mail className="size-3.5" aria-hidden="true" />
        Newsletters by email
      </p>
      {!inbox.enabled ? (
        <p className="font-body text-xs leading-relaxed text-ink-soft">
          Email forwarding isn't set up on this server yet. Most newsletters (Substack, Ghost,
          Buttondown, beehiiv) also publish RSS — paste the newsletter's web address above.
        </p>
      ) : inbox.address ? (
        <>
          <p className="font-body text-xs leading-relaxed text-ink-soft">
            Subscribe with this private address — issues arrive here, one feed per sender.
          </p>
          <div className="flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-2 shadow-[var(--shadow-border)]">
            <code
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink"
              title={inbox.address}
            >
              {inbox.address}
            </code>
            <button
              type="button"
              onClick={() => void copy(inbox.address!)}
              aria-label="Copy address"
              className="shrink-0 text-ink-muted transition-colors hover:text-hanko"
            >
              <Copy className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            disabled={actions.inbox.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Replace this address? Mail sent to the old one will stop arriving — you'll need to update your subscriptions.",
                )
              )
                actions.inbox.mutate(true);
            }}
            className="flex items-center gap-1 font-sans text-[11px] text-ink-muted underline-offset-2 hover:text-hanko hover:underline"
          >
            <RefreshCcw className="size-3" aria-hidden="true" />
            New address (stops spam)
          </button>
        </>
      ) : (
        <>
          <p className="font-body text-xs leading-relaxed text-ink-soft">
            Get a private address to subscribe to email-only newsletters.
          </p>
          <button
            type="button"
            disabled={actions.inbox.isPending}
            onClick={() => actions.inbox.mutate(false)}
            className="flex w-full items-center justify-center gap-1.5 rounded bg-hanko px-3 py-2 font-sans text-xs font-medium text-paper shadow-sm transition-colors hover:bg-shu disabled:opacity-60"
          >
            {actions.inbox.isPending ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Mail className="size-3.5" aria-hidden="true" />
            )}
            Create my address
          </button>
        </>
      )}
    </section>
  );
}

export function OpmlTools({ actions }: { actions: Actions }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3 px-1">
      <input
        ref={fileRef}
        type="file"
        accept=".opml,.xml,text/xml,application/xml,text/x-opml"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          if (file.size > 2_000_000) {
            toast.error("That OPML file is too large.");
            return;
          }
          actions.importOpml.mutate(await file.text());
        }}
      />
      <button
        type="button"
        disabled={actions.importOpml.isPending}
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1 font-sans text-[11px] text-ink-muted transition-colors hover:text-hanko disabled:opacity-50"
      >
        {actions.importOpml.isPending ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="size-3.5" aria-hidden="true" />
        )}
        Import OPML
      </button>
      <a
        href={feedsApi.exportOpmlUrl}
        download="kami-feeds.opml"
        className="flex items-center gap-1 font-sans text-[11px] text-ink-muted transition-colors hover:text-hanko"
      >
        <Download className="size-3.5" aria-hidden="true" />
        Export OPML
      </a>
    </div>
  );
}
