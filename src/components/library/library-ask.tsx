import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Highlighter, LoaderCircle, MessageCircleQuestion, Search, X } from "lucide-react";
import { AiChat } from "@/components/ai/ai-chat.tsx";
import { aiApi, type AskMetadata, type LibraryHit } from "@/lib/api/ai";
import { queryKeys } from "@/lib/query-client.ts";
import { cn } from "@/lib/utils.ts";

type Mode = "ask" | "find";

const ASK_EXAMPLES = [
  "What have I saved about habits and focus?",
  "Summarize what I've highlighted this month.",
  "Which pieces disagree with each other?",
];

/** "Ask your library" — a cited chat over saved work, plus search by meaning. */
export function LibraryAsk({
  semantic,
  onClose,
}: {
  /** Semantic search is available (pgvector + embedding key); otherwise keywords. */
  semantic: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("ask");
  return (
    <section aria-label="Ask your library" className="kami-sheet mt-6 space-y-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Ask or find" className="flex gap-1">
          <ModeTab active={mode === "ask"} onClick={() => setMode("ask")}>
            <MessageCircleQuestion className="size-3.5" aria-hidden="true" />
            Ask
          </ModeTab>
          <ModeTab active={mode === "find"} onClick={() => setMode("find")}>
            <Search className="size-3.5" aria-hidden="true" />
            {semantic ? "Find by meaning" : "Find"}
          </ModeTab>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-paper-warm hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {mode === "ask" ? (
        <AiChat
          id="library-ask"
          api={aiApi.askUrl}
          label="Ask your library"
          intro="Questions are answered from your saved articles, highlights and notes, with numbered sources."
          examples={ASK_EXAMPLES}
          placeholder="Ask your library…"
          renderMetadata={(metadata) => <Sources metadata={metadata as AskMetadata} />}
          className="h-[28rem] text-ink"
        />
      ) : (
        <FindByMeaning />
      )}
    </section>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-sans text-xs font-medium transition-colors",
        active ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-warm hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Sources({ metadata }: { metadata: AskMetadata }) {
  const sources = metadata.sources ?? [];
  if (!sources.length) return null;
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Sources">
      {sources.map((s) => (
        <li key={s.n} className="list-none">
          <Link
            to="/read"
            search={{ id: s.articleId }}
            className="inline-flex max-w-64 items-center gap-1 rounded-full bg-paper-warm px-2.5 py-1 font-sans text-[11px] text-ink-soft transition-colors hover:text-hanko"
          >
            <span className="font-semibold text-hanko">[{s.n}]</span>
            {s.kind === "highlights" ? (
              <Highlighter className="size-3 shrink-0" aria-label="Highlights" />
            ) : null}
            <span className="truncate">{s.title}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function FindByMeaning() {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const query = useQuery({
    queryKey: [...queryKeys.ai.all, "search", q],
    queryFn: ({ signal }) => aiApi.search(q, signal),
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft.trim());
        }}
      >
        <label htmlFor="library-find" className="sr-only">
          Describe what you're looking for
        </label>
        <input
          id="library-find"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. that essay about slowing down at work"
          maxLength={500}
          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 font-body text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-hanko/30"
        />
        <button
          type="submit"
          disabled={draft.trim().length < 2}
          className="h-10 rounded-full bg-hanko px-4 font-sans text-xs font-medium text-paper transition-colors hover:bg-shu disabled:opacity-50"
        >
          Find
        </button>
      </form>
      {query.isFetching ? (
        <p className="flex items-center gap-1.5 font-sans text-xs text-ink-muted">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          Searching…
        </p>
      ) : query.isError ? (
        <p className="font-sans text-xs text-hanko">
          {query.error instanceof Error ? query.error.message : "Search failed."}
        </p>
      ) : query.data ? (
        query.data.hits.length ? (
          <ul className="divide-y divide-line">
            {query.data.hits.map((hit) => (
              <Hit key={`${hit.kind}:${hit.articleId}`} hit={hit} />
            ))}
          </ul>
        ) : (
          <p className="font-body text-sm text-ink-muted">Nothing in your library matches that.</p>
        )
      ) : null}
      {query.data && !query.data.semantic ? (
        <p className="font-sans text-[11px] text-ink-muted">
          Matching by keywords: semantic search isn't set up on this server.
        </p>
      ) : null}
    </div>
  );
}

function Hit({ hit }: { hit: LibraryHit }) {
  return (
    <li className="list-none">
      <Link
        to="/read"
        search={{ id: hit.articleId }}
        className="block space-y-1 py-2.5 transition-colors hover:text-hanko"
      >
        <span className="flex items-center gap-1.5 font-sans text-sm font-medium text-ink">
          {hit.kind === "highlights" ? (
            <Highlighter className="size-3.5 shrink-0 text-hanko" aria-label="Highlights" />
          ) : null}
          <span className="truncate">{hit.title}</span>
        </span>
        <span className="line-clamp-2 block font-body text-xs text-ink-muted">{hit.snippet}</span>
      </Link>
    </li>
  );
}
