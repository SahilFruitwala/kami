import { useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  LoaderCircle,
  PencilLine,
  Play,
  Plus,
  RefreshCcw,
  ScanSearch,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Hanko } from "@/components/kami.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useExtractActions, useExtractResults, useExtractsOverview } from "@/hooks/use-extracts.ts";
import type { ExtractResult, ExtractSource, ExtractSourceInput } from "@/lib/api/extracts";
import { relativeTime } from "@/lib/time.ts";
import { cn } from "@/lib/utils.ts";
import { errorMessage } from "@/lib/errors";
import { confirmAction } from "@/lib/confirm.ts";

type Actions = ReturnType<typeof useExtractActions>;

const EXAMPLE: ExtractSourceInput = {
  name: "Product Hunt — top launches",
  url: "https://www.producthunt.com/",
  question:
    "Find the best products launched this week and this month. For each, give the name, link, category and a short description if there is one.",
};

export function ExtractsView({
  sourceId,
  onSelect,
}: {
  sourceId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const overview = useExtractsOverview();
  const actions = useExtractActions();
  const sources = overview.data?.sources ?? [];
  const selected = sources.find((s) => s.id === sourceId) ?? sources[0] ?? null;
  const enabled = overview.data?.enabled ?? true;

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[18.5rem_minmax(0,1fr)] xl:gap-10">
      <aside className="flex flex-col gap-6 lg:sticky lg:top-24">
        <section className="kami-sheet space-y-5 p-4">
          <SourceForm actions={actions} onSaved={onSelect} />
          {sources.length > 0 ? (
            <SourceList sources={sources} selected={selected?.id ?? null} onSelect={onSelect} />
          ) : null}
        </section>
        {!enabled ? (
          <p className="rounded-lg bg-shu-tint p-4 font-body text-xs leading-relaxed text-ink-soft">
            Firecrawl isn't set up on this server yet — add <code>FIRECRAWL_API_KEY</code> to the
            environment to run extracts.
          </p>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        {overview.isPending ? (
          <div className="kami-sheet h-40 animate-pulse opacity-60" aria-hidden="true" />
        ) : overview.isError ? (
          <p className="kami-sheet p-6 font-body text-sm text-ink-soft">
            {errorMessage(overview.error, "Could not load extracts.")}
          </p>
        ) : !selected ? (
          <EmptyExtracts actions={actions} onSaved={onSelect} />
        ) : (
          <SourceDetail
            key={selected.id}
            source={selected}
            enabled={enabled}
            actions={actions}
            onDeleted={() => onSelect(null)}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Sidebar ----------

function SourceForm({
  actions,
  source,
  onSaved,
  onCancel,
}: {
  actions: Actions;
  /** Editing an existing source (otherwise creating one). */
  source?: ExtractSource;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(source?.name ?? "");
  const [url, setUrl] = useState(source?.url ?? "");
  const [question, setQuestion] = useState(source?.question ?? "");
  const busy = source ? actions.update.isPending : actions.create.isPending;
  const prefix = source ? `edit-${source.id}` : "new-extract";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !url.trim() || !question.trim()) return;
    const input = { name: name.trim(), url: url.trim(), question: question.trim() };
    if (source) {
      actions.update.mutate({ id: source.id, input }, { onSuccess: () => onSaved?.(source.id) });
    } else {
      actions.create.mutate(input, {
        onSuccess: (created) => {
          setName("");
          setUrl("");
          setQuestion("");
          onSaved?.(created.id);
        },
      });
    }
  }

  return (
    <form className="space-y-2" onSubmit={submit}>
      {!source ? <p className="kami-label text-ink-muted">Ask a page a question</p> : null}
      <label htmlFor={`${prefix}-url`} className="sr-only">
        Page URL
      </label>
      <Input
        id={`${prefix}-url`}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.producthunt.com/"
        className="h-9 bg-bg/70"
      />
      <label htmlFor={`${prefix}-question`} className="sr-only">
        What to extract
      </label>
      <textarea
        id={`${prefix}-question`}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="Latest products with name, link and category…"
        className="w-full resize-y rounded-lg border border-line bg-bg/70 px-2.5 py-2 font-body text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-ink/30 focus-visible:ring-2 focus-visible:ring-ink/20"
      />
      <label htmlFor={`${prefix}-name`} className="sr-only">
        Name (optional)
      </label>
      <Input
        id={`${prefix}-name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={120}
        placeholder="Name (optional)"
        className="h-9 bg-bg/70"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !url.trim() || !question.trim()}
          className="flex h-9 flex-1 items-center justify-center gap-1 rounded-full bg-hanko px-3 font-sans text-xs font-medium text-paper transition-colors hover:bg-shu disabled:opacity-50"
        >
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : source ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          {source ? "Save changes" : "Save extract"}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-lg px-3 font-sans text-xs text-ink-soft shadow-[var(--shadow-border)] hover:text-ink"
          >
            Cancel
          </button>
        ) : null}
      </div>
      {!source ? (
        <p className="font-body text-[11px] leading-snug text-ink-muted">
          Firecrawl reads the page and answers in Markdown. You review each answer before it's kept.
        </p>
      ) : null}
    </form>
  );
}

function SourceList({
  sources,
  selected,
  onSelect,
}: {
  sources: ExtractSource[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Extracts">
      <p className="kami-label mb-1.5 px-2 text-ink-muted">Saved extracts</p>
      <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">
        {sources.map((s) => {
          const active = s.id === selected;
          return (
            <li key={s.id} className="list-none">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  active ? "bg-shu-tint text-hanko" : "text-ink hover:bg-paper-warm",
                )}
              >
                <ScanSearch
                  className={cn("size-3.5 shrink-0", active ? "text-hanko" : "text-ink-muted")}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate font-sans text-[13px]">{s.name}</span>
                {s.lastError ? (
                  <AlertCircle
                    className="size-3.5 shrink-0 text-danger"
                    aria-label={`Last run failed: ${s.lastError}`}
                  />
                ) : null}
                {s.pending ? (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 font-sans text-[10px] font-semibold",
                      active ? "bg-hanko text-paper" : "bg-bg text-ink-soft",
                    )}
                  >
                    review
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ---------- Detail ----------

function SourceDetail({
  source,
  enabled,
  actions,
  onDeleted,
}: {
  source: ExtractSource;
  enabled: boolean;
  actions: Actions;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const running = actions.run.isPending && actions.run.variables?.id === source.id;

  return (
    <>
      <header className="kami-sheet space-y-3 p-5">
        {editing ? (
          <SourceForm
            actions={actions}
            source={source}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-display text-2xl tracking-tight text-ink">{source.name}</h3>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate font-sans text-xs text-ink-muted hover:text-hanko"
                >
                  <span className="truncate">{source.url}</span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                </a>
              </div>
              <div className="flex items-center gap-1">
                <IconButton title="Edit" onClick={() => setEditing(true)}>
                  <PencilLine className="size-3.5" aria-hidden="true" />
                </IconButton>
                <IconButton
                  title="Delete extract"
                  onClick={async () => {
                    const ok = await confirmAction({
                      title: `Delete “${source.name}”?`,
                      description: `Its ${source.acceptedCount} saved results are deleted too.`,
                      confirmLabel: "Delete",
                    });
                    if (ok) actions.remove.mutate(source.id, { onSuccess: onDeleted });
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </IconButton>
              </div>
            </div>
            <p className="font-body text-sm leading-relaxed whitespace-pre-line text-ink-soft">
              {source.question}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={!enabled || running}
                onClick={() => actions.run.mutate({ id: source.id })}
                className="flex items-center gap-1.5 rounded-full bg-hanko px-3 py-1.5 font-sans text-xs font-medium text-paper transition-colors hover:bg-shu disabled:opacity-60"
              >
                {running ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Play className="size-3.5" aria-hidden="true" />
                )}
                {running ? "Asking Firecrawl…" : "Run"}
              </button>
              <button
                type="button"
                disabled={!enabled || running}
                onClick={() => actions.run.mutate({ id: source.id, fresh: true })}
                title="Skip Firecrawl's cached copy of the page (up to 2 days old) and fetch it live"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-xs text-ink-soft shadow-[var(--shadow-border)] transition-colors hover:text-ink disabled:opacity-60"
              >
                <RefreshCcw className="size-3.5" aria-hidden="true" />
                Run live
              </button>
              <span className="font-sans text-[11px] text-ink-muted">
                {source.lastRunAt ? `Last run ${relativeTime(source.lastRunAt)}` : "Never run"}
              </span>
            </div>
            {source.lastError ? (
              <p className="flex items-start gap-1.5 font-sans text-xs text-hanko">
                <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                {source.lastError}
              </p>
            ) : null}
          </>
        )}
      </header>

      {source.pending ? <PendingResult result={source.pending} actions={actions} /> : null}

      <History sourceId={source.id} count={source.acceptedCount} actions={actions} />
    </>
  );
}

function PendingResult({ result, actions }: { result: ExtractResult; actions: Actions }) {
  const busy =
    (actions.accept.isPending && actions.accept.variables === result.id) ||
    (actions.discard.isPending && actions.discard.variables === result.id);
  return (
    <section
      aria-label="New result to review"
      className="kami-sheet space-y-4 p-5 ring-1 ring-hanko/30"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="kami-label text-hanko">New result · {relativeTime(result.createdAt)}</p>
        <div className="flex items-center gap-1.5">
          <CopyMarkdown markdown={result.markdown} />
          <button
            type="button"
            disabled={busy}
            onClick={() => actions.discard.mutate(result.id)}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 font-sans text-xs text-ink-soft shadow-[var(--shadow-border)] hover:text-ink disabled:opacity-60"
          >
            <X className="size-3.5" aria-hidden="true" />
            Discard
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => actions.accept.mutate(result.id)}
            className="flex items-center gap-1 rounded-full bg-hanko px-3 py-1.5 font-sans text-xs font-medium text-paper hover:bg-shu disabled:opacity-60"
          >
            <Check className="size-3.5" aria-hidden="true" />
            Accept
          </button>
        </div>
      </div>
      <ResultBody result={result} />
    </section>
  );
}

function History({
  sourceId,
  count,
  actions,
}: {
  sourceId: string;
  count: number;
  actions: Actions;
}) {
  const results = useExtractResults(count > 0 ? sourceId : null);
  if (count === 0) {
    return (
      <p className="px-1 font-body text-sm text-ink-muted">
        Accepted results are kept here. Run the extract to get your first one.
      </p>
    );
  }
  return (
    <section aria-label="Accepted results" className="space-y-3">
      <p className="kami-label px-1 text-ink-muted">Kept · {count}</p>
      {results.isPending ? (
        <div className="kami-sheet h-24 animate-pulse opacity-60" aria-hidden="true" />
      ) : (
        (results.data ?? []).map((r, i) => (
          <details key={r.id} open={i === 0} className="kami-sheet group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="font-sans text-sm text-ink">
                {new Date(r.acceptedAt ?? r.createdAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
              <span className="flex items-center gap-1">
                <CopyMarkdown markdown={r.markdown} />
                <IconButton
                  title="Delete result"
                  onClick={async (e) => {
                    e.preventDefault();
                    const ok = await confirmAction({
                      title: "Delete this saved result?",
                      confirmLabel: "Delete",
                    });
                    if (ok) actions.discard.mutate(r.id);
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </IconButton>
              </span>
            </summary>
            <div className="mt-4">
              <ResultBody result={r} />
            </div>
          </details>
        ))
      )}
    </section>
  );
}

function ResultBody({ result }: { result: ExtractResult }) {
  return (
    <div
      className="article-body max-w-none overflow-x-auto"
      // Rendered from Markdown and sanitized on the server.
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
}

function CopyMarkdown({ markdown }: { markdown: string }) {
  return (
    <IconButton
      title="Copy Markdown"
      onClick={(e) => {
        e.preventDefault();
        navigator.clipboard.writeText(markdown).then(
          () => toast.success("Markdown copied"),
          () => toast.error("Copy failed"),
        );
      }}
    >
      <Copy className="size-3.5" aria-hidden="true" />
    </IconButton>
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-paper-warm hover:text-ink"
    >
      {children}
    </button>
  );
}

function EmptyExtracts({ actions, onSaved }: { actions: Actions; onSaved: (id: string) => void }) {
  return (
    <div className="kami-sheet flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Hanko glyph="抄" className="size-12 text-xl" />
      <p className="font-display text-2xl text-ink-soft italic">Nothing extracted yet</p>
      <p className="max-w-md font-body text-sm leading-relaxed text-ink-muted">
        Point KAMI at a page and say what you want from it — the newest launches, a price list, a
        schedule. Firecrawl answers in Markdown; keep the answers you like.
      </p>
      <button
        type="button"
        disabled={actions.create.isPending}
        onClick={() => actions.create.mutate(EXAMPLE, { onSuccess: (s) => onSaved(s.id) })}
        className="mt-2 flex items-center gap-1.5 rounded-full bg-hanko px-3 py-2 font-sans text-xs font-medium text-paper hover:bg-shu disabled:opacity-60"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Try the Product Hunt example
      </button>
    </div>
  );
}
