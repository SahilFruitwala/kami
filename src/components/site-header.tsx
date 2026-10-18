import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  BookOpen,
  Clapperboard,
  Gift,
  House,
  LibraryBig,
  Menu,
  // Plane,
  Plus,
  // Rss,
  // ScanSearch,
  Settings as SettingsIcon,
  Tv,
} from "lucide-react";
import { KAMI_GLYPH } from "@/components/kami.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { Show, SignInButton, SignUpButton, UserButton } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user.ts";
import { cn } from "@/lib/utils.ts";

export type SitePane =
  | "home"
  | "library"
  | "feeds"
  | "extracts"
  | "trips"
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
    | "/feeds"
    | "/extracts"
    | "/trips"
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
  // { id: "feeds", to: "/feeds", label: "Feeds", icon: Rss },
  // { id: "extracts", to: "/extracts", label: "Extracts", icon: ScanSearch },
  // { id: "trips", to: "/trips", label: "Trips", icon: Plane },
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

const MOBILE_PANES = PANES;

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

/** Label for the `/ Page` breadcrumb in the top bar. */
const PANE_LABEL: Record<SitePane, string> = {
  ...(Object.fromEntries(PANES.map((p) => [p.id, p.label])) as Record<Pane["id"], string>),
  settings: "Settings",
};

/**
 * Gloss chrome: quiet paper sidebar on desktop (hidden with the menu
 * button), a constant top bar — menu, wordmark, `/ Page` breadcrumb on the
 * left; +, theme and sign-in on the right — and a bottom tab bar on mobile.
 */
export function SiteHeader({
  active,
  onOpenTools,
  sidebarCollapsed = false,
  onToggleSidebar,
}: {
  active: SitePane;
  onOpenTools?: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const topBarPad = sidebarCollapsed ? "lg:pl-0" : "lg:pl-60";
  return (
    <>
      <aside
        id="sanctuary-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-paper",
          sidebarCollapsed ? "lg:hidden" : "lg:flex",
        )}
      >
        <div className="flex h-16 items-center gap-2 px-4">
          {onToggleSidebar ? (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label="Hide sidebar"
              aria-expanded={!sidebarCollapsed}
              aria-controls="sanctuary-sidebar"
              title="Hide sidebar"
              className={ICON_BTN}
            >
              <Menu className="size-[18px]" aria-hidden="true" />
            </button>
          ) : null}
          <Wordmark />
        </div>

        <nav aria-label="Sanctuary pages" className="flex-1 overflow-y-auto px-3 pt-4">
          <p className="px-3 pb-2 font-sans text-xs text-ink-muted">Reading</p>
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

          <p className="mt-6 px-3 pb-2 font-sans text-xs text-ink-muted">Shelves</p>
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

        <div className="border-t border-line px-4 py-4">
          <div className="flex items-center gap-2.5">
            <UserButton />
            <div className="min-w-0 flex-1 leading-tight">
              <SignedName />
            </div>
            <Link
              to="/settings"
              aria-label="Settings"
              aria-current={active === "settings" ? "page" : undefined}
              className={cn(
                ICON_BTN,
                active === "settings" && "bg-surface text-ink shadow-[var(--g-shadow-chip)]",
              )}
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </aside>

      {/* Top bar (desktop) */}
      <div
        className={cn("sticky top-0 z-30 hidden bg-paper/85 backdrop-blur-xl lg:block", topBarPad)}
      >
        <div className="flex h-16 items-center gap-2 px-6">
          {sidebarCollapsed && onToggleSidebar ? (
            <>
              <button
                type="button"
                onClick={onToggleSidebar}
                aria-label="Show sidebar"
                aria-expanded={false}
                aria-controls="sanctuary-sidebar"
                title="Show sidebar"
                className={ICON_BTN}
              >
                <Menu className="size-[18px]" aria-hidden="true" />
              </button>
              <Wordmark />
            </>
          ) : null}
          <p className="flex items-center gap-2 font-sans text-sm text-ink-muted">
            <span aria-hidden="true">/</span>
            <span className="text-ink">{PANE_LABEL[active]}</span>
          </p>
          <div className="ml-auto flex items-center gap-1">
            <span className="mr-2 hidden font-display text-sm text-ink-muted italic xl:block">
              {atmosphere()}
            </span>
            {onOpenTools ? (
              <button
                type="button"
                onClick={onOpenTools}
                aria-label="Capture tools"
                title="Capture tools"
                className={ICON_BTN}
              >
                <Plus className="size-[18px]" aria-hidden="true" />
              </button>
            ) : null}
            <ThemeToggle className="rounded-full text-ink-muted hover:text-ink" />
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button type="button" className="g-btn g-btn--ghost ml-1 h-9">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button type="button" className="g-btn g-btn--ink h-9">
                  Sign up
                </button>
              </SignUpButton>
            </Show>
          </div>
        </div>
      </div>

      {/* Mobile top row */}
      <div className="sticky top-0 z-40 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-[max(1rem,env(safe-area-inset-left))]">
          <Wordmark />
          <div className="flex items-center gap-1">
            <ThemeToggle className="rounded-full text-ink-muted hover:text-ink" />
            <Link
              to="/settings"
              aria-label="Settings"
              className={cn(
                "flex size-11 items-center justify-center rounded-full text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
                active === "settings" && "text-ink",
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
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1.5 font-sans text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/40",
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

const ICON_BTN =
  "flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-paper-warm hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40";

/** Serif wordmark: the 紙 seal and "Kami". */
function Wordmark() {
  return (
    <Link
      to="/app"
      className="flex min-w-0 items-center gap-2 rounded-full pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
      aria-label="Kami home"
    >
      <span
        className="kami-hanko flex size-7 items-center justify-center rounded-full font-display text-sm leading-none"
        lang="ja"
      >
        {KAMI_GLYPH}
      </span>
      <span
        className="font-display text-[22px] leading-none tracking-tight text-ink"
        translate="no"
      >
        Kami
      </span>
    </Link>
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
        "flex h-9 items-center gap-2.5 rounded-full px-3 font-sans text-sm transition-[color,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40",
        active
          ? "bg-surface font-medium text-ink shadow-[var(--g-shadow-chip),0_0_0_1px_var(--g-line)]"
          : "font-medium text-ink-muted hover:bg-paper-warm hover:text-ink",
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
        <span className="block truncate font-sans text-sm font-medium text-ink">
          {user?.displayName ?? "Reader"}
        </span>
        <span className="block font-display text-[13px] text-ink-muted italic">A Kami reader</span>
      </Show>
      <Show when="signed-out">
        <span className="block font-sans text-sm font-medium text-ink">Guest</span>
        <span className="block font-display text-[13px] text-ink-muted italic">
          Sign in to shelve works
        </span>
      </Show>
    </>
  );
}
