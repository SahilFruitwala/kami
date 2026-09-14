import React, { startTransition, type ReactNode } from "react";
import { Archive, Inbox } from "lucide-react";
import type { LibraryTab } from "@/lib/filter-library.ts";
import { cn } from "@/lib/utils.ts";

export function LibraryTabs({
  tab,
  inboxCount,
  archiveCount,
  onTab,
}: {
  tab: LibraryTab;
  inboxCount: number;
  archiveCount: number;
  onTab: (tab: LibraryTab) => void;
}) {
  function select(next: LibraryTab) {
    if (next === tab) return;
    startTransition(() => onTab(next));
  }

  return (
    <nav
      aria-label="Library views"
      role="tablist"
      className="mt-10 flex items-center gap-2 border-b border-line"
    >
      <TabButton
        active={tab === "inbox"}
        onClick={() => select("inbox")}
        aria-controls="library-article-list"
      >
        <Inbox className="size-4" aria-hidden="true" />
        <span>Inbox</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors",
            tab === "inbox"
              ? "bg-ink text-paper"
              : "bg-paper-warm text-ink-soft",
          )}
        >
          {inboxCount}
        </span>
      </TabButton>
      <TabButton
        active={tab === "archive"}
        onClick={() => select("archive")}
        aria-controls="library-article-list"
      >
        <Archive className="size-4" aria-hidden="true" />
        <span>Archive</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors",
            tab === "archive"
              ? "bg-ink text-paper"
              : "bg-paper-warm text-ink-soft",
          )}
        >
          {archiveCount}
        </span>
      </TabButton>
    </nav>
  );
}

function TabButton({
  active,
  onClick,
  children,
  ...props
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30",
        active
          ? "border-ink text-ink font-semibold"
          : "border-transparent text-ink-muted hover:text-ink",
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
