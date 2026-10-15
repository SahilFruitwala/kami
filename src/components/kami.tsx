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
        square ? "rounded-lg border border-white/40" : "rounded-full",
        className,
      )}
    >
      {glyph}
    </span>
  );
}

/** Small rounded tag chip for categories and filters (Gloss "Classics" chip). */
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
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-sans text-xs font-medium",
        tone === "paper" && "border-line bg-surface text-ink-soft",
        tone === "vermilion" && "border-line bg-surface text-ink",
        tone === "bamboo" && "border-transparent bg-bamboo-wash text-bamboo",
        tone === "indigo" && "border-transparent bg-aizome/10 text-aizome",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small muted section eyebrow with an optional icon, e.g. "Personal library". */
export function KamiEyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("flex items-center gap-2 font-sans text-sm text-ink-muted", className)}>
      {children}
    </p>
  );
}
