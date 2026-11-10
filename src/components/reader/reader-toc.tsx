import type { TocEntry } from "@/lib/article-toc.ts";
import { cn } from "@/lib/utils.ts";

export function ReaderToc({
  entries,
  activeId,
  onJump,
  className,
  heading = "Contents",
}: {
  entries: TocEntry[];
  activeId?: string;
  onJump: (id: string) => void;
  className?: string;
  heading?: string;
}) {
  if (entries.length < 2) return null;
  return (
    <nav aria-label="Contents" className={className}>
      {heading ? <p className="kami-label mb-2 opacity-60">{heading}</p> : null}
      <ol className="max-h-[min(28rem,60vh)] space-y-0.5 overflow-y-auto kami-quiet-scroll">
        {entries.map((entry) => {
          const active = activeId === entry.id;
          return (
            <li key={entry.id} className={entry.level === 3 ? "pl-3" : undefined}>
              <button
                type="button"
                title={entry.text}
                aria-current={active ? "location" : undefined}
                onClick={() => onJump(entry.id)}
                className={cn(
                  "block w-full border-l-2 px-2.5 py-1.5 text-left font-sans text-[13px] leading-snug transition-colors",
                  active
                    ? "border-hanko bg-hanko/10 font-medium text-ink"
                    : "border-transparent text-ink-muted hover:border-ink/20 hover:text-ink",
                )}
              >
                {entry.text}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
