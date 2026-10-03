import { Link } from "@tanstack/react-router";
import { KAMI_GLYPH } from "@/components/kami.tsx";

export function SiteFooter() {
  return (
    <footer className="w-full bg-paper py-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:px-6 md:flex-row lg:px-12">
        <div className="flex items-center gap-3">
          <span
            className="kami-hanko flex size-7 items-center justify-center rounded-[0.25rem] font-display text-sm font-bold leading-none"
            lang="ja"
            aria-hidden="true"
          >
            {KAMI_GLYPH}
          </span>
          <p className="font-body text-sm text-ink-soft">
            © Kami Sanctuary. Mindful archival reading and contemplative journaling.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <Link
            to="/settings"
            className="font-sans text-xs text-ink-muted hover:text-hanko hover:underline"
          >
            Settings
          </Link>
        </div>
      </div>
    </footer>
  );
}
