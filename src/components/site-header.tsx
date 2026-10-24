import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  BookOpen,
  Clapperboard,
  Gift,
  House,
  LibraryBig,
  ChevronDown,
  Search,
  Plane,
  Plus,
  // Rss,
  // ScanSearch,
  Settings as SettingsIcon,
  Tv,
} from "lucide-react";
import { KAMI_GLYPH } from "@/components/kami.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { Show, SignInButton, SignUpButton, UserButton } from "@/lib/auth/gates";
import { useSlidePill } from "@/hooks/use-slide-pill.ts";
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

/** Primary panes — Home first, then library + vault. */
const SANCTUARY_PANES: Pane[] = [
  { id: "home", to: "/app", label: "Home", icon: House },
  { id: "library", to: "/library", label: "Library", icon: LibraryBig },
  // { id: "feeds", to: "/feeds", label: "Feeds", icon: Rss },
  // { id: "extracts", to: "/extracts", label: "Extracts", icon: ScanSearch },
  { id: "trips", to: "/trips", label: "Trips", icon: Plane },
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

const SHELF_IDS = new Set<SitePane>(["movies", "series", "books", "wishlist"]);

const NAV_LINK =
  "relative z-[1] flex h-9 items-center gap-1.5 rounded-full px-4 font-sans text-[14.5px] font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40";

/**
 * Top bar: wordmark, a pill nav whose highlight slides to the active page
 * (Shelves opens a menu of the four shelf pages), and a tool cluster on the
 * right. Phones get a compact top row plus a bottom tab bar.
 */
export function SiteHeader({
  active,
  onOpenTools,
}: {
  active: SitePane;
  onOpenTools?: () => void;
}) {
  const { ref, pill } = useSlidePill<HTMLDivElement>([active]);
  const onShelf = SHELF_IDS.has(active);
  const [shelvesOpen, setShelvesOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shelvesOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setShelvesOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShelvesOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [shelvesOpen]);

  useEffect(() => setShelvesOpen(false), [active]);

  const linkClass = (isActive: boolean) =>
    cn(NAV_LINK, isActive ? "text-ink" : "text-ink-soft hover:text-ink");

  return (
    <>
      {/* Top bar (desktop) */}
      <div className="sticky top-0 z-40 hidden bg-paper/85 backdrop-blur-xl lg:block">
        <div className="mx-auto flex h-[68px] w-full max-w-[1200px] items-center gap-6 px-8">
          <Wordmark />
          <nav
            ref={ref}
            aria-label="Pages"
            data-slide=""
            className="g-seg relative mx-auto !h-auto gap-0.5 p-1"
          >
            <span ref={pill} className="g-seg-pill" aria-hidden="true" />
            {SANCTUARY_PANES.slice(0, 2).map((pane) => (
              <Link
                key={pane.id}
                to={pane.to}
                aria-current={active === pane.id ? "page" : undefined}
                className={linkClass(active === pane.id)}
              >
                {pane.label}
              </Link>
            ))}
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={shelvesOpen}
                aria-current={onShelf ? "page" : undefined}
                onClick={() => setShelvesOpen((v) => !v)}
                className={linkClass(onShelf)}
              >
                Shelves
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform duration-300 ease-[var(--ease-spring)]",
                    shelvesOpen && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </button>
              <div
                role="menu"
                aria-label="Shelves"
                data-open={shelvesOpen}
                className="kami-menu absolute top-[calc(100%+10px)] left-1/2 z-50 grid min-w-44 -translate-x-1/2 gap-0.5 rounded-2xl bg-surface p-1.5 shadow-[var(--shadow-raised)]"
              >
                {SHELF_PANES.map((pane) => (
                  <Link
                    key={pane.id}
                    to={pane.to}
                    role="menuitem"
                    aria-current={active === pane.id ? "page" : undefined}
                    tabIndex={shelvesOpen ? 0 : -1}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 font-sans text-sm font-medium text-ink-soft transition-colors hover:bg-paper-warm hover:text-ink aria-[current=page]:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                  >
                    <pane.icon className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
                    {pane.label}
                  </Link>
                ))}
              </div>
            </div>
            {SANCTUARY_PANES.slice(2).map((pane) => (
              <Link
                key={pane.id}
                to={pane.to}
                aria-current={active === pane.id ? "page" : undefined}
                className={linkClass(active === pane.id)}
              >
                {pane.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("kami:open-palette"))}
              aria-label="Search"
              title="Search (⌘K)"
              className={ICON_BTN}
            >
              <Search className="size-[18px]" aria-hidden="true" />
            </button>
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
            <Link
              to="/settings"
              aria-label="Settings"
              aria-current={active === "settings" ? "page" : undefined}
              className={cn(ICON_BTN, active === "settings" && "bg-paper-warm text-ink")}
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
            </Link>
            <ThemeToggle className="rounded-full text-ink-muted hover:text-ink" />
            <Show when="signed-in">
              <div className="ml-1.5 flex items-center gap-2">
                <UserButton />
              </div>
            </Show>
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
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("kami:open-palette"))}
              aria-label="Search"
              className={ICON_BTN}
            >
              <Search className="size-[18px]" aria-hidden="true" />
            </button>
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

      {/* Mobile bottom tab bar: every page is a tab, so it scrolls */}
      <nav
        aria-label="Pages"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="flex overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PANES.map((pane) => (
            <li key={pane.id} className="min-w-[3.75rem] flex-1">
              <Link
                to={pane.to}
                aria-current={active === pane.id ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 py-1.5 font-sans text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/40",
                  active === pane.id ? "font-semibold text-ink" : "font-medium text-ink-muted",
                )}
              >
                <pane.icon
                  className={cn("size-4", active === pane.id && "text-persimmon")}
                  aria-hidden="true"
                />
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
  "flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-300 ease-[var(--ease-spring)] hover:bg-paper-warm hover:text-ink hover:rotate-[14deg] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40";

/** Serif wordmark: the 紙 seal and "Kami". */
function Wordmark() {
  return (
    <Link
      to="/app"
      className="group flex min-w-0 items-center gap-2.5 rounded-full pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
      aria-label="Kami home"
    >
      <span
        className="kami-hanko flex size-7 items-center justify-center rounded-full font-display text-sm leading-none transition-transform duration-500 ease-[var(--ease-spring)] group-hover:rotate-12"
        lang="ja"
      >
        {KAMI_GLYPH}
      </span>
      <span
        className="font-display text-[24px] leading-none tracking-tight text-ink"
        translate="no"
      >
        Kami
      </span>
    </Link>
  );
}
