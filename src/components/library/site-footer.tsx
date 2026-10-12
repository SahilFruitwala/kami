import { Link } from "@tanstack/react-router";
import { KAMI_GLYPH } from "@/components/kami.tsx";

export function SiteFooter() {
  return (
    <footer className="w-full py-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:px-6 md:flex-row lg:px-12">
        <div className="flex items-center gap-3">
          <span
            className="kami-hanko flex size-6 items-center justify-center rounded-full font-display text-xs leading-none"
            lang="ja"
            aria-hidden="true"
          >
            {KAMI_GLYPH}
          </span>
          <p className="font-display text-sm text-ink-muted italic">
            Kami — a quiet library for things worth reading.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <Link
            to="/settings"
            className="font-sans text-sm text-ink-muted transition-colors hover:text-ink"
          >
            Settings
          </Link>
        </div>
      </div>
    </footer>
  );
}
