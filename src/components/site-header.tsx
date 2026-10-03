import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  BookOpen,
  Clapperboard,
  Gift,
  House,
  LibraryBig,
  Search,
  Settings as SettingsIcon,
  Tv,
} from "lucide-react";
import { KAMI_GLYPH } from "@/components/kami.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Show, SignInButton, SignUpButton, UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user.ts";
import { cn } from "@/lib/utils.ts";

export type SitePane =
  | "home"
  | "library"
  | "vault"
  | "movies"
  | "series"
  | "books"
  | "wishlist"
  | "settings";

type Pane = {
  id: Exclude<SitePane, "settings">;
  to:
    | "/app"
    | "/library"
    | "/vault"
    | "/shelves/movies"
    | "/shelves/series"
    | "/shelves/books"
    | "/shelves/wishlist";
  label: string;
  icon: typeof LibraryBig;
};

/** Primary sanctuary panes — Home first, then library + vault. */
const SANCTUARY_PANES: Pane[] = [
  { id: "home", to: "/app", label: "Home", icon: House },
  { id: "library", to: "/library", label: "Library", icon: LibraryBig },
  { id: "vault", to: "/vault", label: "Vault", icon: Bookmark },
];

/** Each shelf type is its own first-class page (not nested under Shelf Ledger). */
const SHELF_PANES: Pane[] = [
  { id: "movies", to: "/shelves/movies", label: "Movies", icon: Clapperboard },
  { id: "series", to: "/shelves/series", label: "Series", icon: Tv },
  { id: "books", to: "/shelves/books", label: "Books", icon: BookOpen },
  { id: "wishlist", to: "/shelves/wishlist", label: "Wishlist", icon: Gift },
];

const PANES: Pane[] = [...SANCTUARY_PANES, ...SHELF_PANES];

const MOBILE_PANES = [
  { id: "home" as const, to: "/app" as const, label: "Home", icon: House },
  ...PANES,
];

/** Time-aware desk atmosphere chip, after the Stitch top bar. Rotates daily so it feels alive. */
function atmosphere(now = new Date()): string {
  const h = now.getHours();
  const m = now.getMinutes();
  const start = new Date(now.getFullYear(), 0, 0).getTime();
  const day = Math.floor((now.getTime() - start) / 86_400_000);
  const pick = (options: string[]) => options[day % options.length];

  // Little easter eggs — rare, fun, still on-theme.
  if (h === 3 && m === 33) return "Witching Ink · 3:33 Club";
  if (h === 11 && m === 11) return "Eleven Eleven · Make a Wish";
  if (h === 0 && m < 5) return "Fresh Page · Midnight Ink";

  if (h < 4)
    return pick([
      "Night Ink · Deep Sumi",
      "Owl Hours · Wet Brush",
      "Silent Press · Moon Paper",
      "Midnight Binding · Cold Tea",
    ]);
  if (h < 6)
    return pick([
      "First Light · Damp Sumi",
      "Dawn Press · Pale Washi",
      "Early Ink · Rooster Wash",
      "Blue Hour · Thin Mist",
    ]);
  if (h < 9)
    return pick([
      "Quiet Morning · Soft Sumi",
      "Warm Kettle · Fresh Fold",
      "Morning Press · Crisp Edge",
      "Sunrise Margin · Light Grain",
    ]);
  if (h < 12)
    return pick([
      "Late Morning · Bright Pulp",
      "Second Cup · Steady Hand",
      "High Sun · Clean Cut",
      "Open Window · Paper Flutter",
    ]);
  if (h < 15)
    return pick([
      "Still Afternoon · Warm Paper",
      "Slow Sun · Heavy Brush",
      "Tea Break · Ink Rest",
      "Lazy Light · Dust Motes",
    ]);
  if (h < 18)
    return pick([
      "Golden Hour · Amber Wash",
      "Low Sun · Long Shadow",
      "Drying Ink · Warm Deckles",
      "Late Press · Honey Paper",
    ]);
  if (h < 22)
    return pick([
      "Lantern Evening · Charcoal Wash",
      "Evening Bind · Soft Glow",
      "Night Press · Warm Lamp",
      "Crickets · Folded Corner",
    ]);
  return pick([
    "Night Owl · Deep Indigo",
    "Last Page · Fading Lantern",
    "Deep Fold · Quiet House",
    "Moon Margin · Dry Brush",
  ]);
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
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-paper lg:flex">
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <Link
            to="/app"
            className="flex items-center gap-2.5 rounded-[0.25rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            aria-label="Kami home"
          >
            <span
              className="kami-hanko flex size-8 items-center justify-center rounded-[0.25rem] font-display text-sm font-bold leading-none"
              lang="ja"
            >
              {KAMI_GLYPH}
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

        <nav aria-label="Sanctuary pages" className="flex-1 overflow-y-auto px-3 pt-6">
          <p className="kami-label px-2 pb-2 text-ink-faint">Sanctuary Panes</p>
          <ul className="space-y-0.5">
            {SANCTUARY_PANES.map((pane) => (
              <li key={pane.id}>
                <PaneLink to={pane.to} active={active === pane.id}>
                  <pane.icon className="size-4 shrink-0" aria-hidden="true" />
                  {pane.label}
                </PaneLink>
              </li>
            ))}
          </ul>

          <p className="kami-label mt-6 px-2 pb-2 text-ink-faint">Shelves</p>
          <ul className="space-y-0.5">
            {SHELF_PANES.map((pane) => (
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
          <div className="flex items-center gap-2">
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
      <div className="sticky top-0 z-40 border-b border-line bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-[max(1rem,env(safe-area-inset-left))]">
          <Link to="/app" className="flex items-center gap-2" aria-label="Kami home">
            <span
              className="kami-hanko flex size-7 items-center justify-center rounded-[0.25rem] font-display text-xs font-bold leading-none"
              lang="ja"
            >
              {KAMI_GLYPH}
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
            <Link
              to="/settings"
              aria-label="Settings"
              className={cn(
                "flex size-11 items-center justify-center rounded-[0.25rem] text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                active === "settings" && "text-hanko",
              )}
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
            </Link>
            <UserButton />
          </div>
        </div>
      </div>

      {/* Mobile bottom tab bar — scrollable now that shelves are first-class panes */}
      <nav
        aria-label="Sanctuary pages"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="flex overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MOBILE_PANES.map((pane) => (
            <li key={pane.id} className="min-w-[4.25rem] flex-1">
              <Link
                to={pane.to}
                aria-current={active === pane.id ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1.5 font-sans text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-hanko/40",
                  active === pane.id ? "font-semibold text-ink" : "font-medium text-ink-muted",
                )}
              >
                <pane.icon className="size-4" aria-hidden="true" />
                {pane.label}
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

function SignedName() {
  const user = useCurrentUser();
  return (
    <>
      <Show when="signed-in">
        <span className="block truncate font-sans text-xs font-semibold text-ink">
          {user?.displayName ?? "Sanctuary"}
        </span>
        <span className="block font-sans text-[11px] text-ink-muted">
          In deep focus
        </span>
      </Show>
      <Show when="signed-out">
        <span className="block font-sans text-xs font-semibold text-ink">Guest</span>
        <span className="block font-sans text-[11px] text-ink-muted">Sign in to bind works</span>
      </Show>
    </>
  );
}
