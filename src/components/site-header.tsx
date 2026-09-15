import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bookmark,
  Clapperboard,
  LibraryBig,
  NotebookPen,
  Plus,
  Search,
  Settings as SettingsIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { Show, SignInButton, SignUpButton, UserButton } from "@/lib/auth/gates";
import { useLibraryStore } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

export type SitePane =
  | "home"
  | "library"
  | "journal"
  | "vault"
  | "shelves"
  | "settings";

type Pane = {
  id: Exclude<SitePane, "home" | "settings">;
  to: "/library" | "/journal" | "/vault" | "/shelves";
  label: string;
  icon: typeof LibraryBig;
};

/** Sanctuary panes — mirrors the Stitch Sanctuary sidebar (Stitch: Washi Reader and Journal). */
const PANES: Pane[] = [
  { id: "library", to: "/library", label: "Library", icon: LibraryBig },
  { id: "journal", to: "/journal", label: "Journal", icon: NotebookPen },
  { id: "vault", to: "/vault", label: "Vault", icon: Bookmark },
  { id: "shelves", to: "/shelves", label: "Shelf Ledger", icon: Clapperboard },
];

/** Time-aware desk atmosphere chip, after the Stitch top bar. */
function atmosphere(): string {
  const h = new Date().getHours();
  if (h < 5) return "Night Ink · Deep Sumi";
  if (h < 12) return "Quiet Morning · Soft Sumi";
  if (h < 18) return "Still Afternoon · Warm Paper";
  return "Lantern Evening · Charcoal Wash";
}

/** Synthetic ⌘K — the palette owns its open state and listens globally. */
function openPalette() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true }),
  );
}

/**
 * Sanctuary chrome: fixed left sidebar on desktop (Stitch Sanctuary layout),
 * slim utility top bar, and a bottom tab bar on mobile.
 */
export function SiteHeader({
  active,
  onOpenTools: _onOpenTools,
}: {
  active: SitePane;
  onOpenTools?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-paper lg:flex">
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-[0.25rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            aria-label="Kami home"
          >
            <span className="kami-hanko flex size-8 items-center justify-center rounded-[0.25rem] font-display text-sm font-bold">
              K
            </span>
            <span className="leading-none">
              <span className="block font-display text-base font-semibold tracking-tight text-ink" translate="no">
                KAMI
              </span>
              <span className="kami-label mt-0.5 block text-ink-muted">
                Washi &amp; Thought
              </span>
            </span>
          </Link>
        </div>

        <div className="px-5 pt-5">
          <Button
            type="button"
            className="h-11 w-full gap-2 bg-hanko font-sans text-sm font-semibold text-white hover:bg-shu"
            onClick={() => void navigate({ to: "/" })}
          >
            <Plus className="size-4" aria-hidden="true" />
            Clip Article
          </Button>
        </div>

        <nav aria-label="Sanctuary pages" className="flex-1 overflow-y-auto px-3 pt-6">
          <p className="kami-label px-2 pb-2 text-ink-faint">Sanctuary Panes</p>
          <ul className="space-y-0.5">
            {PANES.map((pane) => (
              <li key={pane.id}>
                <PaneLink to={pane.to} active={active === pane.id}>
                  <pane.icon className="size-4 shrink-0" aria-hidden="true" />
                  {pane.label}
                </PaneLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-line px-5 py-4">
          <TodayCard />
          <div className="mt-3 flex items-center gap-2">
            <UserButton />
            <div className="min-w-0 flex-1 leading-tight">
              <SignedName />
            </div>
            <Link
              to="/settings"
              aria-label="Settings"
              className={cn(
                "rounded-[0.25rem] p-2 text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                active === "settings" && "text-ink",
              )}
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </aside>

      {/* Slim utility top bar (desktop) */}
      <div className="sticky top-0 z-30 hidden border-b border-line bg-paper/90 backdrop-blur-xl lg:block lg:pl-60">
        <div className="flex h-14 items-center gap-3 px-6">
          <button
            type="button"
            onClick={openPalette}
            className="kami-sheet flex h-9 w-full max-w-md items-center gap-2 px-3 font-sans text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 truncate text-left">Search washi, authors, or concepts…</span>
            <kbd className="shrink-0 rounded-[0.25rem] bg-paper-warm px-1.5 py-0.5 text-[11px] tabular-nums">
              ⌘&nbsp;K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <span className="kami-label mr-1 hidden text-ink-muted xl:block">{atmosphere()}</span>
            <ThemeToggle />
            <Show when="signed-out">
              <SignInButton mode="modal">
                <Button type="button" variant="outline" className="h-9">
                  Sign in
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button type="button" className="h-9 bg-hanko text-white hover:bg-shu">
                  Sign up
                </Button>
              </SignUpButton>
            </Show>
          </div>
        </div>
      </div>

      {/* Mobile top row */}
      <div className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link to="/" className="flex items-center gap-2" aria-label="Kami home">
            <span className="kami-hanko flex size-7 items-center justify-center rounded-[0.25rem] font-display text-xs font-bold">
              K
            </span>
            <span className="font-display text-base font-semibold tracking-tight text-ink" translate="no">
              KAMI
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={openPalette}
              aria-label="Search"
              className="rounded-[0.25rem] p-2.5 text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            >
              <Search className="size-4" aria-hidden="true" />
            </button>
            <ThemeToggle />
            <UserButton />
          </div>
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Sanctuary pages"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="grid grid-cols-4">
          {PANES.map((pane) => (
            <li key={pane.id}>
              <Link
                to={pane.to}
                aria-current={active === pane.id ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 font-sans text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-hanko/40",
                  active === pane.id ? "font-semibold text-ink" : "font-medium text-ink-muted",
                )}
              >
                <pane.icon className="size-4" aria-hidden="true" />
                {pane.id === "shelves" ? "Shelves" : pane.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Spacer so footer content clears the mobile tab bar */}
      <div className="h-2 lg:hidden" aria-hidden="true" />
    </>
  );
}

function PaneLink({
  to,
  active,
  children,
}: {
  to: Pane["to"];
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-[0.25rem] px-2 py-2 font-sans text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
        active ? "bg-paper-warm font-semibold text-ink" : "font-medium text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

/** Today's practice, after the Stitch sidebar mini-card. */
function TodayCard() {
  const library = useLibraryStore((s) => s.library);
  const passages = library.reduce((n, row) => n + (row.highlights?.length ?? 0), 0);
  return (
    <div className="rounded-[0.25rem] bg-paper-warm px-3 py-2">
      <p className="font-sans text-[11px] font-medium text-ink-soft">
        {library.length} {library.length === 1 ? "work" : "works"} bound
      </p>
      <p className="font-sans text-[11px] text-ink-muted">{passages} passages inked</p>
    </div>
  );
}

function SignedName() {
  return (
    <>
      <Show when="signed-in">
        <span className="block truncate font-sans text-xs font-semibold text-ink">Sanctuary</span>
        <span className="block font-sans text-[11px] text-ink-muted">In deep focus</span>
      </Show>
      <Show when="signed-out">
        <span className="block font-sans text-xs font-semibold text-ink">Guest</span>
        <span className="block font-sans text-[11px] text-ink-muted">Sign in to bind works</span>
      </Show>
    </>
  );
}
