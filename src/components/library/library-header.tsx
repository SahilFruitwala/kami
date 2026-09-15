import { BookMarked, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { Show, SignInButton, SignUpButton, UserButton } from "@/lib/auth/gates";
import type { LibraryTab } from "@/lib/filter-library.ts";
import { cn } from "@/lib/utils.ts";

export function LibraryHeader({
  onOpenTools,
  tab,
  onTab,
  minutesToday,
  passagesInked,
}: {
  onOpenTools: () => void;
  tab: LibraryTab;
  onTab: (tab: LibraryTab) => void;
  minutesToday: number;
  passagesInked: number;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-12">
        <div className="flex min-w-0 items-center gap-3">
          <span className="kami-hanko flex size-8 items-center justify-center rounded-[0.25rem] font-display text-sm font-bold">
            K
          </span>
          <div className="leading-none">
            <p className="font-display text-base font-semibold tracking-tight text-ink">
              KAMI
            </p>
            <p className="kami-label mt-0.5 hidden text-ink-muted sm:block">
              Washi &amp; Thought
            </p>
          </div>
          <span className="mx-1 hidden h-6 w-px bg-line md:block" aria-hidden="true" />
          <p className="hidden items-center gap-1.5 rounded-[0.25rem] bg-paper-warm px-2.5 py-1 text-xs font-medium text-ink-soft xl:flex">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
            {minutesToday} mins read today · {passagesInked} passages inked
          </p>
        </div>

        <nav aria-label="Sanctuary panes" className="hidden items-center gap-1 lg:flex">
          <PaneLink active={tab !== "vault"} onClick={() => onTab("inbox")}>
            Library
          </PaneLink>
          <PaneLink active={tab === "vault"} onClick={() => onTab("vault")}>
            Vault
          </PaneLink>
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Button type="button" variant="ghost" className="h-11 gap-2" onClick={onOpenTools}>
            <Sparkles className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Capture tools</span>
          </Button>
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button type="button" variant="outline" className="h-11">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button type="button" className="h-11 bg-hanko text-white hover:bg-shu">
                Sign up
              </Button>
            </SignUpButton>
          </Show>
          <UserButton />
        </div>
      </div>
      {/* Mobile pane switcher */}
      <nav
        aria-label="Sanctuary panes"
        className="flex items-center gap-1 border-t border-line px-4 py-1.5 lg:hidden"
      >
        <PaneLink active={tab !== "vault"} onClick={() => onTab("inbox")}>
          <BookMarked className="size-3.5" aria-hidden="true" />
          Library
        </PaneLink>
        <PaneLink active={tab === "vault"} onClick={() => onTab("vault")}>
          Vault
        </PaneLink>
      </nav>
    </header>
  );
}

function PaneLink({
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
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-[0.25rem] px-3 py-1.5 font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
        active
          ? "bg-paper-warm font-semibold text-ink"
          : "font-medium text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
