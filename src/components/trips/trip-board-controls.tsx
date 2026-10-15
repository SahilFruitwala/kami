import { Check, ChevronDown, ExternalLink, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { PrimaryButton, QuietButton } from "./trip-fields.tsx";

export function FormButtons({
  busy,
  onCancel,
  label,
}: {
  busy: boolean;
  onCancel: () => void;
  label: string;
}) {
  return (
    <div className="flex gap-2">
      <PrimaryButton type="submit" disabled={busy} className="flex-1">
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-4" aria-hidden="true" />
        )}
        {label}
      </PrimaryButton>
      <QuietButton type="button" onClick={onCancel}>
        Cancel
      </QuietButton>
    </div>
  );
}

/** Chevron button that shows or hides a section's body. */
export function ToggleButton({
  open,
  onToggle,
  controls,
  className,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  controls: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={cn("flex min-w-0 items-center gap-1.5 text-left", className)}
    >
      <ChevronDown
        className={cn("size-4 shrink-0 text-ink-muted transition-transform", !open && "-rotate-90")}
        aria-hidden="true"
      />
      {children}
    </button>
  );
}

export function SourceLink({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Stored URLs are validated server-side; fall back to the raw text.
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex max-w-full items-center gap-1 font-sans text-xs text-ink-muted hover:text-hanko"
    >
      <span className="truncate">{host}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}
