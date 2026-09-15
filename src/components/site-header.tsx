import { Link } from "@tanstack/react-router";
import { BookMarked, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { Show, SignInButton, SignUpButton, UserButton } from "@/lib/auth/gates";
import { useLibraryStore } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

export type SitePane = "home" | "library" | "vault";

/** Top-level sanctuary navigation shared by Home, Library, and Vault. */
export function SiteHeader({
  active,
  onOpenTools,
}: {
  active: SitePane;
  onOpenTools: () => void;
}) {
  const library = useLibraryStore((s) => s.library);
  const minutesToday = library
    .filter((row) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return row.savedAt >= start.getTime();
    })
    .reduce((n, row) => n + (row.readingMinutes || 0), 0);
  const passagesInked = library.reduce(
    (n, row) => n + (row.highlights?.length ?? 0),
    0,
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-12">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-[0.25rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            aria-label="Kami home"
          >
            <span className="kami-hanko flex size-8 items-center justify-center rounded-[0.25rem] font-display text-sm font-bold">
              K
            </span>
            <span className="leading-none">
              <span className="block font-display text-base font-semibold tracking-tight text-ink">
                KAMI
              </span>
              <span className="kami-label mt-0.5 hidden text-ink-muted sm:block">
                Washi &amp; Thought
              </span>
            </span>
          </Link>
          <span className="mx-1 hidden h-6 w-px bg-line md:block" aria-hidden="true" />
          <p className="hidden items-center gap-1.5 rounded-[0.25rem] bg-paper-warm px-2.5 py-1 text-xs font-medium text-ink-soft xl:flex">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
            {minutesToday} mins read today · {passagesInked} passages inked
          </p>
        </div>

        <nav aria-label="Sanctuary pages" className="hidden items-center gap-1 lg:flex">
          <PaneLink to="/" active={active === "home"}>
            Home
          </PaneLink>
          <PaneLink to="/library" active={active === "library"}>
            Library
          </PaneLink>
          <PaneLink to="/vault" active={active === "vault"}>
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
      {/* Mobile page switcher */}
      <nav
        aria-label="Sanctuary pages"
        className="flex items-center gap-1 border-t border-line px-4 py-1.5 lg:hidden"
      >
        <PaneLink to="/" active={active === "home"}>
          <BookMarked className="size-3.5" aria-hidden="true" />
          Home
        </PaneLink>
        <PaneLink to="/library" active={active === "library"}>
          Library
        </PaneLink>
        <PaneLink to="/vault" active={active === "vault"}>
          Vault
        </PaneLink>
      </nav>
    </header>
  );
}

function PaneLink({
  to,
  active,
  children,
}: {
  to: "/" | "/library" | "/vault";
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-[0.25rem] px-3 py-1.5 font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
        active
          ? "bg-paper-warm font-semibold text-ink"
          : "font-medium text-ink-muted hover:text-ink",
      )}
    >
      <span className="flex items-center gap-1.5">{children}</span>
    </Link>
  );
}
