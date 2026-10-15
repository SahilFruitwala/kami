import { cn } from "@/lib/utils.ts";

export function Card({
  id,
  title,
  copy,
  children,
}: {
  id: string;
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="kami-sheet scroll-mt-24 p-4 sm:p-8">
      <h3 className="font-display text-xl text-ink">{title}</h3>
      <p className="mt-1 max-w-2xl font-body text-sm leading-relaxed text-ink-muted">{copy}</p>
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </section>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="kami-label text-ink-muted">{children}</p>;
}

export function MiniButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-lg px-2.5 py-1 font-sans text-xs font-medium transition-colors",
        danger ? "text-danger hover:bg-danger/10" : "bg-paper-warm text-ink hover:bg-line",
      )}
    >
      {children}
    </button>
  );
}

export function ExportButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-hanko px-4 py-2 font-sans text-xs font-medium text-paper hover:bg-shu"
    >
      {children}
    </button>
  );
}
