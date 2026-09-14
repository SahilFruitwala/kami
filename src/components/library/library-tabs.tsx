import { startTransition, type ReactNode } from "react";
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
    <div className="mt-10 flex items-center gap-1 border-b border-line">
      <TabButton active={tab === "inbox"} onClick={() => select("inbox")}>
        <Inbox className="size-4" />
        Inbox
        <span className="tabular-nums text-muted">{inboxCount}</span>
      </TabButton>
      <TabButton active={tab === "archive"} onClick={() => select("archive")}>
        <Archive className="size-4" />
        Archive
        <span className="tabular-nums text-muted">{archiveCount}</span>
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 items-center gap-2 px-3 text-sm",
        active ? "border-b-2 border-ink text-ink" : "text-muted",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
