import { BookMarked, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Show, SignInButton, SignUpButton, UserButton } from "@/lib/auth/gates";

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
      <div className="flex items-center gap-1 sm:gap-2">
        <Button type="button" variant="ghost" className="h-11 gap-2" onClick={onOpenTools}>
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">Capture tools</span>
        </Button>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button type="button" variant="outline" className="h-11">
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button type="button" className="h-11">
              Sign up
            </Button>
          </SignUpButton>
        </Show>
        <UserButton />
      </div>
    </header>
  );
}
