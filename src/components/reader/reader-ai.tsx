import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tags, Folder, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { TidyButton } from "@/components/reader/tidy-review.tsx";
import { toast } from "sonner";
import { aiApi, type ArticleSummary } from "@/lib/api/ai";
import { queryKeys } from "@/lib/query-client.ts";
import { useLibraryStore } from "@/lib/store.ts";
import type { LibraryItem } from "@/lib/library-item.ts";
import { useAiStatus } from "@/hooks/use-ai.ts";

const chip =
  "inline-flex min-h-9 items-center gap-1 rounded-full bg-surface px-3 font-sans text-xs font-medium text-ink shadow-border transition-colors hover:bg-paper-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30";

/** The reader's AI card: a cached summary with a folder suggestion, auto-tag and tidy. */
export function ReaderAi({ item }: { item: LibraryItem }) {
  const { enabled } = useAiStatus();
  if (!enabled) return null;
  return <SummaryCard item={item} />;
}

function SummaryCard({ item }: { item: LibraryItem }) {
  const client = useQueryClient();
  const key = queryKeys.ai.summary(item.id);
  const query = useQuery({
    queryKey: key,
    queryFn: () => aiApi.summary(item.id),
    staleTime: Infinity,
    retry: false,
  });
  const summarize = useMutation({
    mutationFn: () => aiApi.summarize(item.id),
    onSuccess: (summary) => client.setQueryData(key, summary),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not summarize this article."),
  });
  const summary = query.data ?? null;

  return (
    <section aria-label="AI summary" className="space-y-3 rounded-xl bg-ink/5 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="kami-label flex items-center gap-1.5 opacity-60">
          <Sparkles className="size-3.5 text-hanko" aria-hidden="true" />
          Gist
        </span>
        {summary ? (
          <button
            type="button"
            onClick={() => summarize.mutate()}
            disabled={summarize.isPending}
            aria-label="Summarize again"
            title="Summarize again"
            className="inline-flex size-8 items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100 disabled:opacity-40"
          >
            {summarize.isPending ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="size-3.5" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      {query.isPending ? (
        <div className="h-16 animate-pulse rounded-lg bg-ink/5" aria-hidden="true" />
      ) : summary ? (
        <SummaryBody item={item} summary={summary} />
      ) : (
        <>
          <p className="font-body text-sm italic opacity-70">
            A short summary, the key points, and a folder to file it in.
          </p>
          <button
            type="button"
            onClick={() => summarize.mutate()}
            disabled={summarize.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-hanko px-4 py-2.5 font-sans text-xs font-medium text-paper transition-colors hover:bg-shu disabled:opacity-60"
          >
            {summarize.isPending ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-3.5" aria-hidden="true" />
            )}
            {summarize.isPending ? "Reading…" : "Summarize"}
          </button>
        </>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <AutoTagButton item={item} />
        <TidyButton item={item} />
      </div>
    </section>
  );
}

/** Tag the article with up to three categories from a fixed list. */
function AutoTagButton({ item }: { item: LibraryItem }) {
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const autoTag = useMutation({
    mutationFn: () => aiApi.autoTag(item.id),
    onSuccess: ({ tags }) => {
      const added = tags.filter((t) => !item.tags.includes(t));
      upsertItem({ ...item, tags });
      toast.success(
        added.length
          ? `Tagged: ${added.join(", ")}`
          : "Already tagged with the best-fit categories",
      );
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not auto-tag this article."),
  });
  return (
    <button
      type="button"
      onClick={() => autoTag.mutate()}
      disabled={autoTag.isPending}
      title="Add up to three categories (technology, science, business…) from a fixed list"
      className="flex items-center gap-1.5 font-sans text-[11px] opacity-60 transition-opacity hover:opacity-100 disabled:opacity-40"
    >
      {autoTag.isPending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Tags className="size-3.5" aria-hidden="true" />
      )}
      {autoTag.isPending ? "Tagging…" : "Auto-tag"}
    </button>
  );
}

function SummaryBody({ item, summary }: { item: LibraryItem; summary: ArticleSummary }) {
  const folders = useLibraryStore((s) => s.folders);
  const setItemFolder = useLibraryStore((s) => s.setItemFolder);
  const folder =
    summary.folderId && summary.folderId !== item.folderId
      ? folders.find((f) => f.id === summary.folderId)
      : undefined;

  return (
    <div className="space-y-3">
      {summary.stale ? (
        <p className="font-sans text-[11px] text-hanko">
          The text changed since this summary. Summarize again to refresh it.
        </p>
      ) : null}
      <p className="font-body text-sm leading-relaxed">{summary.tldr}</p>
      {summary.keyPoints.length ? (
        <ul className="list-disc space-y-1.5 pl-4 font-body text-sm leading-snug opacity-90">
          {summary.keyPoints.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      ) : null}
      {folder ? (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="font-sans text-[11px] font-semibold opacity-60">Suggested folder</p>
          <div className="flex flex-wrap gap-1.5">
            {folder ? (
              <button
                type="button"
                className={chip}
                onClick={() => {
                  setItemFolder(item.id, folder.id);
                  toast.success(`Filed in ${folder.name}`);
                }}
              >
                <Folder className="size-3" aria-hidden="true" />
                {folder.name}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
