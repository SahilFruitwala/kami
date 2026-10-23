import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Headphones,
  Highlighter,
  LibraryBig,
  Link2,
  Play,
  RotateCcw,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { Hanko, KAMI_GLYPH, WashiTag } from "@/components/kami.tsx";

// Hoisted static content — no per-render allocation.
// Every claim below maps to a real capability in src/:
// capture (paste / link-only / bookmarklet + extension → /capture), tidy (auto clean-up, restore original),
// reader (5 fonts, 3 paper tones), narration (on request, English only, allowance, saved position),
// highlights (3 inks, vault), shelves (movies/TV/books/wishlist, episode tracker), library (tags, folders, ⌘K search), settings (JSON/OPML/CSV export).
const PILLARS = [
  {
    icon: Link2,
    title: "Save",
    copy: "Paste a link or use the bookmarklet or extension. Ads and footers are tidied away for you.",
  },
  {
    icon: Headphones,
    title: "Read or listen",
    copy: "A calm reader in your choice of type and paper — or have the article narrated, right where you left off.",
  },
  {
    icon: Highlighter,
    title: "Keep",
    copy: "Highlight in three inks, tag and file, find anything with ⌘K. Export your data anytime.",
  },
  {
    icon: LibraryBig,
    title: "Track",
    copy: "Shelves for movies, shows, books, and a wishlist — with episode tracking and where to watch.",
  },
] as const;

// Statuses use the real shelf wording from src/lib/shelf-labels.ts.
const SHELF_ROWS = [
  { title: "Severance", kind: "Show", status: "Watching", episode: "S2 · E6", progress: 60 },
  { title: "Piranesi", kind: "Book", status: "Reading" },
  { title: "Perfect Days", kind: "Movie", status: "To watch" },
  { title: "A fountain pen", kind: "Wishlist", status: "Wanted" },
] as const;

// Hand-drawn stand-ins for cover art: no third-party images on the landing page.
const SHELF_POSTERS: Record<(typeof SHELF_ROWS)[number]["title"], React.ReactNode> = {
  Severance: (
    <svg viewBox="0 0 40 60" className="size-full">
      <rect width="40" height="60" fill="#e8ece9" />
      <path d="M0 18h40M0 42h40M14 18v24M26 18v24" stroke="#9fb3ad" strokeWidth="0.75" />
      <rect x="17" y="24" width="6" height="14" fill="#2f4a46" />
      <circle cx="20" cy="21" r="1.6" fill="#2f4a46" />
      <rect x="0" y="52" width="40" height="8" fill="#2f4a46" />
    </svg>
  ),
  Piranesi: (
    <svg viewBox="0 0 40 60" className="size-full">
      <rect width="40" height="60" fill="#1f3550" />
      <path
        d="M4 60V30a6 6 0 0 1 12 0v30M24 60V30a6 6 0 0 1 12 0v30"
        fill="none"
        stroke="#c9d6e3"
        strokeWidth="1"
      />
      <path d="M0 50c6-3 10 3 20 0s14 3 20 0v10H0Z" fill="#4f7aa3" />
      <circle cx="30" cy="12" r="3" fill="#e9dcb8" />
    </svg>
  ),
  "Perfect Days": (
    <svg viewBox="0 0 40 60" className="size-full">
      <defs>
        <linearGradient id="landing-dawn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2c48d" />
          <stop offset="1" stopColor="#d9725a" />
        </linearGradient>
      </defs>
      <rect width="40" height="60" fill="url(#landing-dawn)" />
      <circle cx="20" cy="30" r="7" fill="#fbe8c8" />
      <path d="M0 40h40v20H0Z" fill="#3c4a3f" />
      <path d="M6 40l4-10 4 10M26 40l4-12 4 12" fill="#3c4a3f" />
    </svg>
  ),
  "A fountain pen": (
    <svg viewBox="0 0 40 60" className="size-full">
      <rect width="40" height="60" fill="#2a2724" />
      <path d="M20 12l5 18-5 18-5-18Z" fill="#c9a75e" />
      <path d="M20 30v16" stroke="#2a2724" strokeWidth="0.8" />
      <circle cx="20" cy="30" r="1.2" fill="#2a2724" />
      <circle cx="20" cy="52" r="1.5" fill="#c84b31" />
    </svg>
  ),
};

const FAQS = [
  {
    q: "What if a site blocks saving?",
    a: "Save it link-only, paste the text yourself, or use the bookmarklet or extension — your browser already has the page.",
  },
  {
    q: "How does listening work?",
    a: "Tap Listen in the reader and KAMI narrates the article in the background. The audio is private to you. English only for now, and it uses a narration allowance set by whoever runs your KAMI.",
  },
  {
    q: "Can I get my data out?",
    a: "Anytime from Settings: library JSON, OPML for RSS readers, and highlights as CSV.",
  },
  {
    q: "Is KAMI open source?",
    a: "Yes, under the MIT license. Read the code, contribute, or run your own.",
  },
] as const;

export function LandingPage() {
  return (
    <div className="kami-desk relative min-h-dvh overflow-x-hidden text-ink [touch-action:manipulation]">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-[60] focus-visible:rounded-lg focus-visible:bg-hanko focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-paper"
      >
        Skip to content
      </a>

      <header className="fixed inset-x-0 top-0 z-50 bg-paper/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-2 px-[max(1rem,env(safe-area-inset-left))] sm:gap-3 sm:px-6">
          <Link
            to="/"
            className="group inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
          >
            <Hanko glyph={KAMI_GLYPH} className="size-7 text-sm" title="Kami" />
            <span
              className="hidden font-display text-[22px] leading-none tracking-tight min-[360px]:block"
              translate="no"
            >
              Kami
            </span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Button type="button" variant="ghost" className="hidden h-10 sm:inline-flex" asChild>
              <Link to="/login/$">Sign In</Link>
            </Button>
            <Button
              type="button"
              className="h-10 rounded-full bg-hanko px-4 text-paper hover:bg-shu"
              asChild
            >
              <Link to="/sign-up/$">Begin</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="pt-[calc(4rem+env(safe-area-inset-top))]">
        {/* Hero */}
        <section
          aria-labelledby="hero-heading"
          className="mx-auto w-full max-w-3xl px-4 pt-14 pb-12 text-center sm:px-6 sm:pt-24 sm:pb-16"
        >
          <div className="flex justify-center gap-2">
            <WashiTag tone="paper">Quiet read-later</WashiTag>
            <WashiTag tone="indigo">Open source</WashiTag>
          </div>
          <h1
            id="hero-heading"
            className="mt-6 font-display text-[2.75rem] leading-[1.02] font-normal tracking-[-0.025em] text-balance sm:text-[4.25rem]"
          >
            Save it now. Read or listen later.
          </h1>
          <p className="kami-body mx-auto mt-5 max-w-xl text-base leading-[1.85] text-pretty text-ink-soft sm:text-lg sm:leading-[1.85]">
            A quiet place for the articles you mean to get to.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Button
              type="button"
              size="lg"
              className="h-11 w-full rounded-full bg-hanko px-6 text-paper hover:bg-shu sm:w-auto"
              asChild
            >
              <Link to="/sign-up/$">
                Start your library
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 w-full sm:w-auto"
              asChild
            >
              <Link to="/login/$">Sign In</Link>
            </Button>
          </div>
        </section>

        {/* Preview — the reader sheet with the audio player beneath it */}
        <section
          aria-label="Preview of the KAMI reader"
          className="mx-auto w-full max-w-3xl px-4 sm:px-6"
        >
          <div className="kami-sheet-raised kami-grain relative overflow-hidden" aria-hidden="true">
            <span className="absolute top-0 right-10 h-10 w-3 rounded-b-[0.25rem] bg-hanko/80" />
            <div className="px-6 pt-8 pb-6 sm:px-12 sm:pt-12">
              <p className="kami-label text-ink-muted">Essay · 9 min</p>
              <p className="mt-2 font-display text-2xl tracking-tight sm:text-3xl">
                A Field Guide to Focus
              </p>
              <p className="kami-body mt-4 text-base leading-[1.9] text-ink-soft">
                Attention is not something you find; it is something you make room for. Close the
                extra tabs, set the phone face down, and{" "}
                <mark className="rounded-sm bg-[color-mix(in_oklab,#c84b31_30%,transparent)] px-0.5 text-ink">
                  give one page your whole mind
                </mark>{" "}
                — the rest will keep until tomorrow.
              </p>
            </div>
            <div className="flex items-center gap-3 border-t border-line bg-paper-warm/50 px-6 py-3 sm:px-12">
              <RotateCcw className="size-4 text-ink-soft" />
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-hanko text-paper">
                <Play className="size-4 translate-x-px" />
              </span>
              <RotateCw className="size-4 text-ink-soft" />
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                <div className="h-full w-[38%] rounded-full bg-hanko" />
              </div>
              <span className="font-sans text-[11px] text-ink-muted tabular-nums">12:04</span>
              <span className="hidden rounded-full border border-line px-2 py-0.5 font-sans text-[11px] text-ink-soft tabular-nums sm:inline">
                1.25×
              </span>
            </div>
          </div>
        </section>

        {/* Tracker — a shelf in the same quiet style */}
        <section
          aria-labelledby="track-heading"
          className="mx-auto w-full max-w-3xl px-4 pt-16 sm:px-6 sm:pt-20"
        >
          <h2
            id="track-heading"
            className="text-center font-display text-2xl font-normal tracking-tight text-balance sm:text-3xl"
          >
            And everything you’re watching or reading next.
          </h2>
          <p className="kami-body mx-auto mt-2 max-w-md text-center text-sm leading-[1.8] text-ink-soft">
            Movies, shows, books, and a wishlist — on one shelf.
          </p>
          <ul
            className="kami-sheet-raised mt-6 divide-y divide-line px-5 sm:px-8"
            aria-label="Example shelf"
          >
            {SHELF_ROWS.map((row) => (
              <li key={row.title} className="flex items-center gap-4 py-4">
                <span
                  aria-hidden="true"
                  className="h-[4.5rem] w-12 shrink-0 overflow-hidden rounded-[0.3rem] shadow-[0_1px_2px_rgb(0_0_0/0.12),0_4px_10px_-4px_rgb(0_0_0/0.25)]"
                >
                  {SHELF_POSTERS[row.title]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[15px] tracking-tight">
                    {row.title}
                  </span>
                  <span className="kami-label mt-0.5 block text-ink-muted">{row.kind}</span>
                  {"episode" in row && (
                    <span className="mt-2 flex items-center gap-2">
                      <span className="h-1 w-24 overflow-hidden rounded-full bg-line">
                        <span
                          className="block h-full rounded-full bg-hanko"
                          style={{ width: `${row.progress}%` }}
                        />
                      </span>
                      <span className="font-sans text-[11px] text-ink-muted tabular-nums">
                        {row.episode}
                      </span>
                    </span>
                  )}
                </span>
                <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 font-sans text-xs text-ink-soft">
                  {row.status}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Pillars */}
        <section
          aria-label="What KAMI does"
          className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-20"
        >
          <ul className="grid gap-10 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">
            {PILLARS.map((p) => (
              <li key={p.title}>
                <p.icon className="size-5 text-hanko" aria-hidden="true" />
                <h2 className="mt-3 font-display text-xl tracking-tight">{p.title}</h2>
                <p className="kami-body mt-1.5 text-sm leading-[1.8] text-ink-soft">{p.copy}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section
          aria-labelledby="faq-heading"
          id="faq"
          className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 pb-16 sm:px-6"
        >
          <h2 id="faq-heading" className="font-display text-2xl font-normal tracking-tight">
            Questions
          </h2>
          <div className="mt-4 divide-y divide-line border-y border-line">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-left font-display text-[15px] font-medium tracking-tight hover:text-hanko focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span
                    aria-hidden="true"
                    className="font-sans text-xl leading-none text-hanko transition-transform duration-150 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="kami-body mt-2 max-w-2xl text-sm leading-[1.8] text-ink-soft">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section
          aria-labelledby="cta-heading"
          className="mx-auto w-full max-w-3xl px-4 pb-20 text-center sm:px-6"
        >
          <h2
            id="cta-heading"
            className="font-display text-3xl font-normal tracking-tight text-balance sm:text-4xl"
          >
            Leave the noise behind.
          </h2>
          <Button
            type="button"
            size="lg"
            className="mt-6 h-11 rounded-full bg-hanko px-6 text-paper hover:bg-shu"
            asChild
          >
            <Link to="/sign-up/$">
              <BookOpen className="size-4" aria-hidden="true" />
              Start your library
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 font-sans text-sm text-ink-muted sm:flex-row sm:px-6">
          <span className="inline-flex items-center gap-2">
            <Hanko glyph={KAMI_GLYPH} square className="size-5 text-[9px]" />
            <span className="font-display text-ink" translate="no">
              KAMI
            </span>
            <span>· MIT licensed</span>
          </span>
          <nav aria-label="Footer" className="flex gap-5">
            <a href="#faq" className="hover:text-hanko">
              FAQ
            </a>
            <Link to="/login/$" className="hover:text-hanko">
              Sign In
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
