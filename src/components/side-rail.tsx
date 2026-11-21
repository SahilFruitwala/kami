import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { KAMI_GLYPH } from "@/components/kami.tsx";
import type { SitePane } from "@/components/site-header.tsx";
import { useCompass } from "@/hooks/use-compass.ts";
import { useDeskStats } from "@/hooks/use-desk-stats.ts";
import { useShelfCounts } from "@/hooks/use-shelf-queries.ts";
import { useThemeStore } from "@/hooks/use-theme.ts";
import { CharacterAvatar } from "@/components/character-avatar.tsx";
import { useCurrentUser } from "@/lib/auth/use-current-user.ts";

type To =
  | "/app"
  | "/compass"
  | "/library"
  | "/vault"
  | "/shelves/movies"
  | "/shelves/series"
  | "/shelves/books"
  | "/shelves/wishlist"
  | "/settings";

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V21H3z",
  library: "M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-1 3 15.5-3.5 1z",
  vault: "M6 3h12v18l-6-4-6 4z",
  research:
    "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
  moon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z",
};

/**
 * Desktop navigation: a spine down the left edge. Phones keep the compact top
 * row and bottom tab bar from SiteHeader.
 */
export function SideRail({ active, onOpenTools }: { active: SitePane; onOpenTools?: () => void }) {
  const stats = useDeskStats();
  const counts = useShelfCounts().data;
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const user = useCurrentUser();
  const compass = useCompass().model;
  const habitsLeft = compass ? compass.todayList.filter((h) => !h.metToday).length : 0;

  const item = (pane: SitePane, to: To, label: string, lead: ReactNode, count?: number) => (
    <Link to={to} className="rd-nav-item" aria-current={active === pane ? "page" : undefined}>
      {lead}
      {label}
      {count !== undefined ? <span className="rd-count">{count}</span> : null}
    </Link>
  );
  const dot = (c: string) => <span className="rd-dot" style={{ background: c }} />;

  return (
    <aside className="rd-rail" aria-label="Pages">
      <Link to="/app" className="rd-brand" aria-label="Kami home">
        <span className="rd-seal" lang="ja">
          {KAMI_GLYPH}
        </span>
        <b>Kami</b>
      </Link>

      <div className="rd-rail-actions">
        <button
          type="button"
          className="rd-add"
          aria-label="Add"
          onClick={() => window.dispatchEvent(new Event("kami:open-palette"))}
        >
          <Icon d={ICONS.search} /> <span>Add</span> <kbd>⌘K</kbd>
        </button>
        {onOpenTools ? (
          <button
            type="button"
            className="rd-icon-btn"
            onClick={onOpenTools}
            aria-label="Capture tools"
            title="Capture tools"
          >
            <Icon d={ICONS.plus} />
          </button>
        ) : null}
      </div>

      <nav className="rd-group" aria-label="Read">
        <small>Read</small>
        {item("home", "/app", "Today", <Icon d={ICONS.home} />)}
        {item("library", "/library", "Library", <Icon d={ICONS.library} />, stats.inbox)}
        {item("vault", "/vault", "Vault", <Icon d={ICONS.vault} />, stats.vaultCount)}
      </nav>

      <nav className="rd-group" aria-label="Plan">
        <small>Plan</small>
        {item(
          "compass",
          "/compass",
          "Compass",
          <Icon d={ICONS.compass} />,
          habitsLeft || undefined,
        )}
      </nav>

      <nav className="rd-group" aria-label="Shelves">
        <small>Shelves</small>
        {item("movies", "/shelves/movies", "Movies", dot("#b5532c"), counts?.movie)}
        {item("series", "/shelves/series", "Series", dot("#3b4aa0"), counts?.tv)}
        {item("books", "/shelves/books", "Books", dot("#4f7d58"), counts?.book)}
        {item("wishlist", "/shelves/wishlist", "Wishlist", dot("#c08a45"), counts?.wishlist)}
      </nav>

      <div className="rd-rail-foot">
        {item("settings", "/settings", "Settings", <Icon d={ICONS.settings} />)}
        <div className="rd-me">
          <CharacterAvatar className="rd-avatar" />
          <span>{user?.displayName?.split(" ")[0] ?? "You"}</span>
          <button
            type="button"
            className="rd-theme"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            <Icon d={ICONS.moon} />
          </button>
        </div>
      </div>
    </aside>
  );
}
