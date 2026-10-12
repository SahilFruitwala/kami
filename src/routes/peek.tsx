import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, ExternalLink, LoaderCircle, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell.tsx";
import { aiApi, type PagePeek } from "@/lib/api/ai";
import type { BookmarkletPayload } from "@/lib/bookmarklet.ts";
import { stashCapturePayload, takeStashedCapturePayload } from "@/lib/session-article.ts";

/**
 * "Summarize page with KAMI" from the browser extension: /capture stashes the
 * page and routes here; we show a quick summary, and Save hands the same
 * page to Home's normal capture flow.
 */
export const Route = createFileRoute("/peek")({
  ssr: false,
  component: PeekPage,
});

function PeekPage() {
  const navigate = useNavigate();
  return (
    <AppShell
      active="home"
      onOpenItem={(item) => void navigate({ to: "/read", search: { id: item.id } })}
    >
      <Peek />
    </AppShell>
  );
}

type State =
  | { status: "loading" }
  | { status: "ready"; peek: PagePeek }
  | { status: "error"; message: string };

function Peek() {
  const navigate = useNavigate();
  const payload = useRef<BookmarkletPayload | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  // Mounted inside AppShell, so the session is confirmed before the stash is spent.
  useEffect(() => {
    if (payload.current) return;
    const page = takeStashedCapturePayload();
    if (!page) {
      setState({ status: "error", message: "No page arrived. Try the extension again." });
      return;
    }
    payload.current = page;
    aiApi
      .peek({ url: page.url || undefined, title: page.title, html: page.html })
      .then((peek) => setState({ status: "ready", peek }))
      .catch((err: unknown) =>
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not summarize that page.",
        }),
      );
  }, []);

  function save() {
    if (!payload.current || !stashCapturePayload(payload.current)) return;
    void navigate({ to: "/app", replace: true });
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-2xl flex-col justify-center px-4 py-10 sm:px-6">
      <section aria-label="Page summary" className="kami-sheet space-y-4 p-6">
        <p className="flex items-center gap-2 font-sans text-xs font-semibold text-ink-muted">
          <Sparkles className="size-3.5 text-hanko" aria-hidden="true" />
          Quick look
        </p>
        {state.status === "loading" ? (
          <p className="flex items-center gap-2 font-body text-sm text-ink-muted" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Reading the page…
          </p>
        ) : state.status === "error" ? (
          <>
            <p className="font-body text-sm text-ink-soft" role="alert">
              {state.message}
            </p>
            <div className="flex flex-wrap gap-2">
              {payload.current ? (
                <button
                  type="button"
                  onClick={save}
                  className="inline-flex items-center gap-1.5 rounded-full bg-hanko px-4 py-2 font-sans text-sm font-medium text-paper hover:bg-shu"
                >
                  <BookmarkPlus className="size-4" aria-hidden="true" />
                  Save it anyway
                </button>
              ) : null}
              <Link
                to="/app"
                className="rounded-full bg-surface px-4 py-2 font-sans text-sm text-ink-soft shadow-[var(--shadow-border)] hover:text-ink"
              >
                Go to KAMI
              </Link>
            </div>
          </>
        ) : (
          <PeekBody peek={state.peek} onSave={save} />
        )}
      </section>
    </div>
  );
}

function PeekBody({ peek, onSave }: { peek: PagePeek; onSave: () => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl leading-tight tracking-tight text-ink">
          {peek.title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 font-sans text-xs text-ink-muted">
          {peek.siteName ? <span>{peek.siteName}</span> : null}
          <span>{peek.readingMinutes} min read</span>
          {peek.url ? (
            <a
              href={peek.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline-offset-2 hover:text-hanko hover:underline"
            >
              <ExternalLink className="size-3" aria-hidden="true" />
              Original
            </a>
          ) : null}
        </p>
      </div>
      <p className="font-body text-sm leading-relaxed text-ink">{peek.tldr}</p>
      {peek.keyPoints.length ? (
        <ul className="list-disc space-y-1 pl-5 font-body text-sm text-ink-soft">
          {peek.keyPoints.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : null}
      {peek.verdict ? (
        <p className="rounded-md bg-bg/70 px-3 py-2 font-body text-xs text-ink-muted">
          {peek.verdict}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onSave}
          className="inline-flex items-center gap-1.5 rounded-full bg-hanko px-4 py-2 font-sans text-sm font-medium text-paper hover:bg-shu"
        >
          <BookmarkPlus className="size-4" aria-hidden="true" />
          Save to library
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-full bg-surface px-4 py-2 font-sans text-sm text-ink-soft shadow-[var(--shadow-border)] hover:text-ink"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
