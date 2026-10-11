import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Eraser,
  Folder,
  MapPinned,
  LoaderCircle,
  MessageCircleQuestion,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { AiChat } from "@/components/ai/ai-chat.tsx";
import { toast } from "sonner";
import { aiApi, type ArticleSummary } from "@/lib/api/ai";
import { queryKeys } from "@/lib/query-client.ts";
import { useLibraryStore, type LibraryItem } from "@/lib/store.ts";
import { useAiStatus } from "@/hooks/use-ai.ts";

const chip =
  "inline-flex min-h-9 items-center gap-1 rounded-full bg-surface px-3 font-sans text-xs font-medium text-ink shadow-border transition-colors hover:bg-paper-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30";

export type AskSeed = { text: string; nonce: number };

/**
 * The reader's AI cards: a cached summary with tag and folder suggestions,
 * and a chat about the article (`seed` prefills it from a selected passage).
 */
export function ReaderAi({
  item,
  askSeed,
}: {
  item: LibraryItem;
  askSeed?: AskSeed | null;
}) {
  const { enabled } = useAiStatus();
  if (!enabled) return null;
  return (
    <>
      <SummaryCard item={item} />
      <AskCard key={item.id} item={item} seed={askSeed ?? null} />
    </>
  );
}

const ASK_EXAMPLES = [
  "What is the main argument?",
  "What evidence does the author give?",
  "What would a critic say?",
];

function AskCard({ item, seed }: { item: LibraryItem; seed: AskSeed | null }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!seed) return;
    setOpen(true);
    box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [seed]);

  return (
    <section
      ref={box}
      id="reader-ask"
      aria-label="Ask about this article"
      className="space-y-2 rounded-xl bg-ink/5 p-4 shadow-sm"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="kami-label flex w-full items-center gap-1.5 text-left opacity-60 transition-opacity hover:opacity-100"
      >
        <MessageCircleQuestion className="size-3.5 text-hanko" aria-hidden="true" />
        Ask this article
      </button>
      {open ? (
        <AiChat
          id={`article-${item.id}`}
          api={aiApi.articleChatUrl(item.id)}
          label="Chat about this article"
          intro="Ask anything about this piece. Select a passage and tap Ask to question it directly."
          examples={ASK_EXAMPLES}
          placeholder="Ask about this article…"
          seed={seed}
          className="h-[26rem]"
        />
      ) : null}
    </section>
  );
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
            A short summary, the key points, and tags to file it under.
          </p>
          <button
            type="button"
            onClick={() => summarize.mutate()}
            disabled={summarize.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-hanko px-4 py-2.5 font-sans text-xs font-semibold text-white shadow-sm transition-colors hover:bg-shu disabled:opacity-60"
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
        <TidyButton item={item} />
        <TripButton item={item} />
      </div>
    </section>
  );
}

/**
 * Remove sponsor blocks, prompts and footers from the saved copy (handy for
 * newsletters). The model picks blocks; the change is saved with an undo.
 */
function TidyButton({ item }: { item: LibraryItem }) {
  const client = useQueryClient();
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const tidy = useMutation({
    mutationFn: () => aiApi.tidy(item.id),
    onSuccess: (result) => {
      if (!result.removed.length) {
        toast.success("Nothing to tidy: this copy is all the piece itself.");
        return;
      }
      const before = item;
      upsertItem({ ...item, contentHtml: result.contentHtml });
      void client.invalidateQueries({ queryKey: queryKeys.ai.summary(item.id) });
      toast.success(
        `Removed ${result.removed.length} block${result.removed.length === 1 ? "" : "s"} of clutter`,
        {
          action: {
            label: "Undo",
            onClick: () => {
              upsertItem(before);
              void client.invalidateQueries({ queryKey: queryKeys.ai.summary(item.id) });
            },
          },
        },
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not tidy this copy."),
  });
  return (
    <button
      type="button"
      onClick={() => tidy.mutate()}
      disabled={tidy.isPending}
      title="Remove ads, sponsor slots, subscribe prompts and footers"
      className="flex items-center gap-1.5 font-sans text-[11px] opacity-60 transition-opacity hover:opacity-100 disabled:opacity-40"
    >
      {tidy.isPending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Eraser className="size-3.5" aria-hidden="true" />
      )}
      {tidy.isPending ? "Tidying…" : "Tidy this copy"}
    </button>
  );
}

/** Draft a trip on the trips board from a travel piece, then open it. */
function TripButton({ item }: { item: LibraryItem }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const plan = useMutation({
    mutationFn: () => aiApi.tripFromArticle(item.id),
    onSuccess: ({ tripId, items, hotels }) => {
      void client.invalidateQueries({ queryKey: queryKeys.trips.all });
      toast.success(
        `Drafted a trip with ${items} plan${items === 1 ? "" : "s"}${hotels ? ` and ${hotels} hotel${hotels === 1 ? "" : "s"}` : ""}`,
      );
      void navigate({ to: "/trips/$id", params: { id: tripId } });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not plan a trip."),
  });
  return (
    <button
      type="button"
      onClick={() => plan.mutate()}
      disabled={plan.isPending}
      title="Turn this travel piece into a draft trip"
      className="flex items-center gap-1.5 font-sans text-[11px] opacity-60 transition-opacity hover:opacity-100 disabled:opacity-40"
    >
      {plan.isPending ? (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <MapPinned className="size-3.5" aria-hidden="true" />
      )}
      {plan.isPending ? "Planning…" : "Plan a trip from this"}
    </button>
  );
}

function SummaryBody({ item, summary }: { item: LibraryItem; summary: ArticleSummary }) {
  const folders = useLibraryStore((s) => s.folders);
  const addTag = useLibraryStore((s) => s.addTag);
  const setItemFolder = useLibraryStore((s) => s.setItemFolder);
  const has = new Set(item.tags.map((t) => t.toLowerCase()));
  const tags = summary.tags.filter((t) => !has.has(t.toLowerCase()));
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
      {tags.length || folder ? (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="font-sans text-[11px] font-semibold opacity-60">Suggested</p>
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
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={chip}
                aria-label={`Add tag ${tag}`}
                onClick={() => addTag(item.id, tag)}
              >
                <Plus className="size-3" aria-hidden="true" />#{tag}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
