import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { aiApi, type FeedDigest as Digest } from "@/lib/api/ai";
import { queryKeys } from "@/lib/query-client.ts";
import { relativeTime } from "@/lib/time.ts";

/** Entry cards carry `id="feed-entry-<id>"` (feeds-view.tsx), so picks can jump to them. */
const entryAnchor = (entryId: string) => `feed-entry-${entryId}`;

/** A digest of unread entries: picks for you, topics, and what's safe to skip. */
export function FeedDigest({
  feedId,
  onMarkRead,
}: {
  feedId: string | null;
  onMarkRead: (ids: string[]) => void;
}) {
  const client = useQueryClient();
  const key = queryKeys.ai.feedDigest(feedId);
  const query = useQuery({
    queryKey: key,
    queryFn: () => aiApi.feedDigest(feedId),
    staleTime: Infinity,
    retry: false,
  });
  const make = useMutation({
    mutationFn: () => aiApi.makeFeedDigest(feedId),
    onSuccess: (digest) => client.setQueryData(key, digest),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not make a digest."),
  });
  const digest = query.data ?? null;

  return (
    <section aria-label="Feed digest" className="kami-sheet space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto flex items-center gap-2 font-sans text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-hanko" aria-hidden="true" />
          Digest
          {digest ? (
            <span className="font-normal text-ink-muted">
              · {digest.entryCount} unread, {relativeTime(digest.createdAt)}
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => make.mutate()}
          disabled={make.isPending}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 font-sans text-xs font-medium text-ink shadow-[var(--shadow-border)] transition-colors hover:bg-paper-warm disabled:opacity-60"
        >
          {make.isPending ? (
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          ) : digest ? (
            <RotateCcw className="size-3.5" aria-hidden="true" />
          ) : (
            <Sparkles className="size-3.5" aria-hidden="true" />
          )}
          {make.isPending ? "Reading the pile…" : digest ? "Refresh" : "Digest unread"}
        </button>
      </div>
      {digest ? (
        <DigestBody digest={digest} onMarkRead={onMarkRead} />
      ) : (
        <p className="font-body text-sm text-ink-muted">
          Skim what's unread: the posts most worth your time, what the rest are about, and what you
          can safely skip.
        </p>
      )}
    </section>
  );
}

function DigestBody({
  digest,
  onMarkRead,
}: {
  digest: Digest;
  onMarkRead: (ids: string[]) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="font-body text-sm leading-relaxed text-ink">{digest.overview}</p>
      {digest.picks.length ? (
        <div className="space-y-1.5">
          <p className="kami-label text-ink-muted">Picked for you</p>
          <ol className="space-y-1.5">
            {digest.picks.map((p) => (
              <li key={p.entryId} className="list-none">
                <a
                  href={`#${entryAnchor(p.entryId)}`}
                  className="block rounded-md px-2 py-1.5 transition-colors hover:bg-paper-warm"
                >
                  <span className="block font-sans text-sm font-medium text-ink">{p.title}</span>
                  <span className="block font-body text-xs text-ink-muted">
                    {p.feedTitle} · {p.why}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {digest.topics.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {digest.topics.map((t) => (
            <article key={t.title} className="space-y-1.5 rounded-lg bg-bg/70 p-3">
              <p className="font-sans text-sm font-semibold text-ink">{t.title}</p>
              <p className="font-body text-sm leading-snug text-ink-soft">{t.summary}</p>
              <ul className="space-y-0.5">
                {t.entries.slice(0, 4).map((e) => (
                  <li key={e.entryId} className="list-none truncate">
                    <a
                      href={`#${entryAnchor(e.entryId)}`}
                      className="font-sans text-[11px] text-ink-accent hover:text-hanko"
                    >
                      {e.title || "(untitled)"}
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : null}
      {digest.skipIds.length ? (
        <button
          type="button"
          onClick={() => {
            onMarkRead(digest.skipIds);
            toast.success(`Marked ${digest.skipIds.length} entries read`);
          }}
          className="inline-flex items-center gap-1.5 font-sans text-xs text-ink-accent transition-colors hover:text-hanko"
        >
          <CheckCheck className="size-3.5" aria-hidden="true" />
          Mark the {digest.skipIds.length} skippable entr{digest.skipIds.length === 1 ? "y" : "ies"}{" "}
          read
        </button>
      ) : null}
    </div>
  );
}

/** A short summary of one entry, fetched (and cached server-side) on first open. */
export function EntrySummary({ entryId }: { entryId: string }) {
  const query = useQuery({
    queryKey: queryKeys.ai.entrySummary(entryId),
    queryFn: () => aiApi.entrySummary(entryId),
    staleTime: Infinity,
    retry: false,
  });
  if (query.isPending) {
    return (
      <p className="mt-3 flex items-center gap-1.5 font-sans text-xs text-ink-muted">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        Summarizing…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p className="mt-3 font-sans text-xs text-hanko">
        {query.error instanceof Error ? query.error.message : "Could not summarize this entry."}
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-1.5 rounded-md bg-bg/70 px-3 py-2.5">
      <p className="font-body text-sm leading-relaxed text-ink">{query.data.tldr}</p>
      {query.data.keyPoints.length ? (
        <ul className="list-disc space-y-0.5 pl-4 font-body text-xs text-ink-soft">
          {query.data.keyPoints.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
