import {
  ArrowRight,
  ClipboardPaste,
  Layers,
  Link2,
  LoaderCircle,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

type CaptureFormProps = {
  url: string;
  busy: boolean;
  error: string;
  onUrlChange: (value: string) => void;
  onClearError: () => void;
  onSave: (url?: string) => void;
  onSaveLinkOnly: () => void;
  onOpenPaste: (seedUrl?: string) => void;
  onOpenBulk: (seedText?: string) => void;
};

export function CaptureForm({
  url,
  busy,
  error,
  onUrlChange,
  onClearError,
  onSave,
  onSaveLinkOnly,
  onOpenPaste,
  onOpenBulk,
}: CaptureFormProps) {
  return (
    <section aria-label="Capture an article">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <label htmlFor="source-url" className="sr-only">
          Article URL
        </label>
        <div className="kami-sheet flex flex-col gap-2 p-2 focus-within:ring-2 focus-within:ring-hanko/40 sm:flex-row sm:items-center sm:px-3">
          <div className="flex min-w-0 w-full items-center gap-2">
            <Search className="size-[18px] shrink-0 text-ink-muted" aria-hidden="true" />
            <Input
              id="source-url"
              name="article-url"
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste a blog or X URL…"
              value={url}
              onChange={(e) => {
                onUrlChange(e.target.value);
                onClearError();
              }}
              className="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            />
            <kbd className="hidden shrink-0 rounded-lg bg-paper-warm px-1.5 py-0.5 font-sans text-[11px] text-ink-muted tabular-nums sm:inline-block">
              ⌘&nbsp;K
            </kbd>
          </div>
          <Button
            type="submit"
            className="h-11 w-full shrink-0 bg-hanko text-white shadow-sm hover:bg-shu active:translate-y-px sm:w-auto"
            disabled={busy}
          >
            {busy ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                <span className="sr-only">Saving…</span>
                <span aria-hidden="true">Saving…</span>
              </>
            ) : (
              <>
                Save Article
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
        {error ? (
          <div className="mt-2 space-y-2" role="alert" aria-live="assertive">
            <p className="text-sm font-medium text-hanko">{error}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={onSaveLinkOnly}
              >
                <Link2 className="size-3.5" aria-hidden="true" />
                Save link anyway
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenPaste(url)}>
                <ClipboardPaste className="size-3.5" aria-hidden="true" />
                Paste article
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenBulk(url)}>
                <Layers className="size-3.5" aria-hidden="true" />
                Bulk save
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex justify-center flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-xs font-medium text-ink-muted">
              Public pages only. Press <kbd className="rounded bg-paper-warm px-1">⌘&nbsp;K</kbd> to
              search the shelf — bind a new scroll.
            </p>
            <button
              type="button"
              onClick={() => onOpenBulk(url)}
              className="inline-flex items-center gap-1 font-sans text-xs font-medium text-hanko hover:underline"
            >
              <Layers className="size-3" aria-hidden="true" />
              Bulk save links
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
