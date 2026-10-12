import { startTransition } from "react";
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
    <div
      aria-label="Library views"
      role="group"
      className="flex items-center gap-1.5 overflow-x-auto pb-1"
    >
      <TabButton active={tab === "inbox"} onClick={() => select("inbox")}>
        All Inflow ({inboxCount})
      </TabButton>
      <TabButton active={tab === "archive"} onClick={() => select("archive")}>
        Archived Inks ({archiveCount})
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-lg px-4 py-2 font-sans text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
        active
          ? "bg-hanko font-semibold text-paper shadow-sm"
          : "text-ink-soft hover:bg-paper-warm hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
