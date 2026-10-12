import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils.ts";

/**
 * Wraps a page in the Gloss theme scope. Everything inside — including the
 * app's own utility classes — picks up Gloss tokens (see styles/gloss.css).
 */
export function GlossPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("gloss min-h-dvh", className)}>{children}</div>;
}

/** Centred content column (~1040–1200px). */
export function GlossColumn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1200px] px-4 sm:px-8", className)}>{children}</div>
  );
}

export function GlossEyebrow({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-sans text-sm text-ink-muted">
      {icon}
      {children}
    </p>
  );
}

/** "101 essays · 10 topics · 35 hours" — numbers in ink, labels muted. */
export function GlossStats({ parts }: { parts: { value: ReactNode; label: string }[] }) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-sans text-[15px] leading-snug text-ink-muted">
      {parts.map((p, i) => (
        <span key={p.label} className="inline-flex items-baseline gap-2">
          {i > 0 ? <span aria-hidden="true">·</span> : null}
          <span>
            <span className="font-medium text-ink tabular-nums">{p.value}</span> {p.label}
          </span>
        </span>
      ))}
    </p>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size,
}: {
  value: T;
  options: { id: T; label: string; icon?: ReactNode }[];
  onChange: (next: T) => void;
  label: string;
  size?: "sm";
}) {
  return (
    <div role="group" aria-label={label} className={cn("g-seg", size === "sm" && "g-seg--sm")}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => value !== o.id && onChange(o.id)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function GlossChip({
  active,
  onClick,
  icon,
  count,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  count?: number;
  /** Selected fill (topic dark). Defaults to ink. */
  color?: { dark: string; tint?: string; text?: string };
  children: ReactNode;
}) {
  const style = color
    ? ({ "--chip-dark": color.dark, "--chip-text": color.text ?? "#F6F1DE" } as CSSProperties)
    : undefined;
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="g-chip" style={style}>
      {icon ? (
        <span
          className="g-chip-icon"
          style={color?.tint && !active ? { background: color.tint, color: color.dark } : undefined}
        >
          {icon}
        </span>
      ) : null}
      {children}
      {count != null ? <span className="g-chip-count">{count}</span> : null}
    </button>
  );
}

/** Search field with a `/` hint; `/` focuses it from anywhere on the page. */
export function GlossSearch({
  id,
  value,
  onChange,
  placeholder,
  className,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      ref.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className={cn("g-search", className)}>
      <Search className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <input
        ref={ref}
        id={id}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
        className="[&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="flex size-6 items-center justify-center rounded-full text-ink-muted hover:text-ink"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : (
        <kbd className="g-kbd" aria-hidden="true">
          /
        </kbd>
      )}
    </div>
  );
}

/** Thin ornament used between title and summary on a book page. */
export function Ornament({ color }: { color?: string }) {
  return (
    <div className="g-ornament" style={color ? { color } : undefined} aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
        <path d="M7 0 8.6 5.4 14 7 8.6 8.6 7 14 5.4 8.6 0 7 5.4 5.4Z" />
      </svg>
    </div>
  );
}

/** CTA with an in-place loading state (width stays fixed). */
export function GlossCta({
  loading,
  onClick,
  children,
  loadingLabel,
  loadingIcon,
}: {
  loading: boolean;
  onClick: () => void;
  children: ReactNode;
  loadingLabel: string;
  loadingIcon?: ReactNode;
}) {
  return (
    <button
      type="button"
      className="g-cta"
      data-loading={loading}
      aria-busy={loading}
      disabled={loading}
      onClick={onClick}
    >
      <span>
        {children}
        <span className="g-cta-arrow" aria-hidden="true">
          →
        </span>
      </span>
      <span aria-live="polite">
        {loadingIcon ?? (
          <span
            className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
            aria-hidden="true"
          />
        )}
        {loadingLabel}
      </span>
    </button>
  );
}
