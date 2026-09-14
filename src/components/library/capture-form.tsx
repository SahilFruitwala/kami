import {
  ArrowRight,
  ClipboardPaste,
  Link2,
  LoaderCircle,
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
    <section className="pt-4">
      <h1 className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
        Your quiet reading list.
      </h1>
      <p className="mt-2 max-w-lg text-base leading-normal text-ink-soft">
        Paste a link to save it. If a site blocks capture, paste the text or use the
        bookmarklet.
      </p>

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <label htmlFor="source-url" className="sr-only">
          Article URL
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
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
            className="sm:flex-1"
          />
          <Button type="submit" className="sm:w-32" disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                <span className="sr-only">Saving…</span>
                <span aria-hidden="true">Saving…</span>
              </>
            ) : (
              <>
                Save
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
        {error ? (
          <div className="mt-2 space-y-2" role="alert" aria-live="assertive">
            <p className="text-sm font-medium text-danger">{error}</p>
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
            </div>
          </div>
        ) : (
          <p className="mt-2.5 text-xs font-medium text-ink-muted sm:text-sm">
            Public pages only. Stays on this device.
          </p>
        )}
      </form>
    </section>
  );
}
