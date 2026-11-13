import { Archive, ArrowLeft, Inbox, Star, Type } from "lucide-react";
import { KAMI_GLYPH } from "@/components/kami.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { cn } from "@/lib/utils.ts";

type ReaderHeaderProps = {
  favorited: boolean;
  archived: boolean;
  prefsOpen: boolean;
  prefsRef: React.RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onToggleFavorite: () => void;
  onTogglePrefs: () => void;
  onArchive: () => void;
  prefsPanel: React.ReactNode;
  /** Narration control (Create audio / progress / player toggle), when available. */
  narration?: React.ReactNode;
};

export function ReaderHeader({
  favorited,
  archived,
  prefsOpen,
  prefsRef,
  onBack,
  onToggleFavorite,
  onTogglePrefs,
  onArchive,
  prefsPanel,
  narration,
}: ReaderHeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-line bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl"
      style={{ viewTransitionName: "reader-header" }}
    >
      <nav
        aria-label="Reader navigation and tools"
        className="mx-auto flex w-full max-w-6xl items-center gap-0.5 px-1 py-2 sm:gap-1 sm:px-6"
      >
        <Button variant="ghost" className="gap-2 px-3 font-medium text-ink" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Library</span>
        </Button>
        <span
          className="ml-1 hidden items-center gap-2 font-display text-sm text-ink-soft md:flex"
          aria-hidden="true"
        >
          <span
            className="kami-hanko flex size-5 items-center justify-center rounded-lg text-[10px] font-bold leading-none"
            lang="ja"
          >
            {KAMI_GLYPH}
          </span>
          Reader
        </span>
        <div
          className="ml-auto flex items-center gap-1"
          role="toolbar"
          aria-label="Reading controls"
        >
          {narration}
          <Button
            variant="ghost"
            size="icon"
            aria-label={favorited ? "Remove favorite" : "Add to favorites"}
            aria-pressed={favorited}
            onClick={onToggleFavorite}
          >
            <Star
              className={cn("size-4", favorited && "fill-persimmon text-persimmon")}
              aria-hidden="true"
            />
          </Button>
          <ThemeToggle className="size-11" />
          <div className="relative" ref={prefsRef}>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reading preferences"
              aria-expanded={prefsOpen}
              aria-haspopup="dialog"
              onClick={onTogglePrefs}
            >
              <Type className="size-4" aria-hidden="true" />
            </Button>
            {prefsOpen ? prefsPanel : null}
          </div>
          <Button variant="ghost" className="gap-2 px-3" onClick={onArchive}>
            {archived ? (
              <Inbox className="size-4" aria-hidden="true" />
            ) : (
              <Archive className="size-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{archived ? "Inbox" : "Archive"}</span>
          </Button>
        </div>
      </nav>
    </header>
  );
}
