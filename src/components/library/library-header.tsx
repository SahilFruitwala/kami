import { BookMarked, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

export function LibraryHeader({ onOpenTools }: { onOpenTools: () => void }) {
  return (
    <header
      className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6"
      style={{ viewTransitionName: "library-header" }}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-md bg-ink text-paper">
          <BookMarked className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold tracking-tight">Quarto</p>
          <p className="hidden text-xs text-muted sm:block">Save & read later</p>
        </div>
      </div>
      <Button type="button" variant="ghost" className="h-11 gap-2" onClick={onOpenTools}>
        <Sparkles className="size-4" />
        <span className="hidden sm:inline">Capture tools</span>
      </Button>
    </header>
  );
}
