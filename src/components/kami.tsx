import { cn } from "@/lib/utils.ts";

/** Brand hanko glyph — 紙 (kami, “paper”), the root of 和紙. */
export const KAMI_GLYPH = "紙";

/** Vermilion signature seal — circular or square hanko stamp. */
export function Hanko({
  glyph,
  className,
  title,
  square,
}: {
  glyph: string;
  className?: string;
  title?: string;
  square?: boolean;
}) {
  return (
    <span
      title={title}
      aria-hidden="true"
      className={cn(
        "kami-hanko flex shrink-0 items-center justify-center font-display text-xs font-semibold select-none",
        square ? "rounded-[0.25rem] border border-white/40" : "rounded-full",
        className,
      )}
    >
      {glyph}
    </span>
  );
}

/** Translucent washi-tape tag for categories and filters. */
export function WashiTag({
  children,
  tone = "paper",
  className,
}: {
  children: React.ReactNode;
  tone?: "paper" | "vermilion" | "bamboo" | "indigo";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[0.25rem] px-2 py-0.5 text-[10px] font-sans font-semibold tracking-wider uppercase",
        tone === "paper" && "bg-paper-warm text-ink-soft",
        tone === "vermilion" && "bg-shu-tint text-hanko",
        tone === "bamboo" && "bg-bamboo-wash text-bamboo",
        tone === "indigo" && "bg-ink-accent/10 text-ink-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small uppercase section eyebrow, e.g. "Bunko Desk". */
export function KamiEyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "kami-label flex items-center gap-2 text-ink-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}
