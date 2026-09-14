import {
  ArrowRight,
  ClipboardPaste,
  Link2,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { normalizeSourceUrl, writeDraftUrl } from "@/lib/session-article.ts";

export const SAMPLE_URLS = [
  { label: "Essay", url: "http://www.paulgraham.com/ds.html" },
  { label: "Blog", url: "https://blog.cloudflare.com/workers-announcement/" },
  {
    label: "X article",
    url: "https://x.com/VibeMarketer_/article/2093330541177352217",
  },
] as const;

type CaptureFormProps = {
  url: string;
  busy: boolean;
  error: string;
  onUrlChange: (value: string) => void;
  onClearError: () => void;
  onSave: (url?: string) => void;
  onSaveLinkOnly: () => void;
  onOpenPaste: (seedUrl?: string) => void;
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
}: CaptureFormProps) {
  return (
    <section className="stagger-in pt-4">
      <p className="text-sm text-muted">Save blogs and X articles. Read them later.</p>
      <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
        Your quiet reading list.
      </h1>
      <p className="mt-3 max-w-lg text-base leading-normal text-ink-soft">
        Paste a link for automatic capture. When a site blocks scraping, paste the article or use
        the bookmarklet — your browser already has the page.
      </p>

      <div className="mt-8">
        <label htmlFor="source-url" className="sr-only">
          Article URL
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
          <Input
            id="source-url"
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste a blog or X URL"
            value={url}
            onChange={(e) => {
              onUrlChange(e.target.value);
              onClearError();
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text");
              if (!pasted) return;
              e.preventDefault();
              const next = normalizeSourceUrl(pasted);
              onUrlChange(next);
              writeDraftUrl(next);
              onClearError();
              onSave(next);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              onSave();
            }}
            className="sm:flex-1"
          />
          <Button type="button" className="sm:w-32" disabled={busy} onClick={() => onSave()}>
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <>
                Save
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>
        {error ? (
          <div className="mt-2 space-y-2" role="alert">
            <p className="text-sm text-danger">{error}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={onSaveLinkOnly}
              >
                <Link2 className="size-3.5" />
                Save link anyway
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenPaste(url)}>
                <ClipboardPaste className="size-3.5" />
                Paste article
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Public pages only. Your list stays on this device.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Try</span>
        {SAMPLE_URLS.map((sample) => (
          <button
            key={sample.url}
            type="button"
            className="h-11 rounded-full bg-paper-warm px-3 text-sm text-ink-soft transition-colors duration-150 hover:bg-line hover:text-ink"
            onClick={() => onSave(sample.url)}
          >
            {sample.label}
          </button>
        ))}
        <button
          type="button"
          className="h-11 rounded-full border border-line px-3 text-sm text-ink-soft hover:bg-paper-warm hover:text-ink"
          onClick={() => onOpenPaste()}
        >
          Paste article
        </button>
      </div>
    </section>
  );
}
