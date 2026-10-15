import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArrowRight,
  BookOpen,
  Command,
  FileDown,
  Highlighter,
  History,
  LibraryBig,
  MoonStar,
  MousePointerClick,
  Search,
  ShieldCheck,
  SunMoon,
  Tags,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { Hanko, KAMI_GLYPH, WashiTag } from "@/components/kami.tsx";

// Hoisted static content — no per-render allocation.
// Every claim below maps to a real capability in src/:
// capture (paste / link-only / manual paste / bookmarklet + extension → /capture, share target),
// library (inbox-archive tabs, deferred search, folders, tags, stars, bulk ops),
// reader (5 fonts, 7 sizes, 3 paper tones, scroll memory),
// highlights (3 inks, notes, vault CSV), journal (calendar, 50k chars/day,
// micro-season label), shelves (movies/TV/books/wishlist, TMDB+book search,
// episode tracker), settings (JSON/OPML/CSV export + import).
const FEATURES = [
  {
    icon: MousePointerClick,
    title: "1-Click Bookmarklet Capture",
    copy: "Saving from the page itself? The bookmarklet grabs the article, auto-imports a clean copy, and opens the reader — even where servers get blocked.",
  },
  {
    icon: Search,
    title: "Instant Search + ⌘K",
    copy: "Search titles, excerpts, tags, and notes as you type with deferred rendering. Jump anywhere from the command palette.",
  },
  {
    icon: Tags,
    title: "Tags, Folders & Stars",
    copy: "File pieces into folders, normalize tags, star favorites, and filter by folder, tag, or favorites in one pass.",
  },
  {
    icon: Archive,
    title: "Inbox & Archive Flow",
    copy: "Triage new saves in the inbox, archive finished reads, and bulk archive, favorite, or delete — with undo when it matters.",
  },
  {
    icon: Highlighter,
    title: "Three-Ink Highlights",
    copy: "Mark passages in Vermilion, Bamboo, or Sumi, attach notes, and revisit every slip in the vault. Export the vault as CSV.",
  },
  {
    icon: FileDown,
    title: "Import & Export, No Lock-In",
    copy: "Bring READMEs of the web with you: import library JSON or OPML, export JSON, OPML for RSS readers, and vault CSV.",
  },
] as const;

const STEPS = [
  {
    n: "1",
    title: "Save a Link",
    copy: "Paste any blog or X article URL — save a full clean copy or link-only. Or fire the bookmarklet from the page itself.",
  },
  {
    n: "2",
    title: "Read Without Noise",
    copy: "Open the distilled Dokusho view: five typefaces, seven sizes, three paper tones, and per-article scroll memory.",
  },
  {
    n: "3",
    title: "File & Find Later",
    copy: "Tag it, folder it, star it, ink it. Deferred search and the vault bring it back in milliseconds.",
  },
] as const;

const READER_POINTS = [
  {
    icon: Type,
    copy: "Five book-grade typefaces — Newsreader, Literata, Source Serif, Atkinson Hyperlegible, Figtree — in seven sizes.",
  },
  {
    icon: BookOpen,
    copy: "Three paper tones per sheet — Pale Washi, Aged Rice Paper, Sumi Dark — independent of the app theme.",
  },
  {
    icon: History,
    copy: "Pick up where you left off with per-article scroll memory and reading-time estimates.",
  },
] as const;

const FAQS = [
  {
    q: "What can I save to KAMI?",
    a: "Public blog posts and X articles. Paste the URL for a clean copy with title, excerpt, hero image, word count, and reading time — or save link-only and fetch the copy later.",
  },
  {
    q: "What happens when a site blocks scraping?",
    a: "Three fallbacks: save link-only, paste the article text manually for review-and-import, or use the bookmarklet — your browser already has the page, so nothing is lost.",
  },
  {
    q: "Do I need an account? Does it work offline?",
    a: "Yes, your library, highlights, and shelves sync to your account. Saves persist locally first, so a dropped connection keeps working and syncs when you're back online.",
  },
  {
    q: "Can I get my data out?",
    a: "Anytime from Settings: library JSON, OPML for RSS readers, and vault CSV for highlights. OPML and JSON import back in too.",
  },
  {
    q: "Does KAMI work on mobile?",
    a: "Yes. The desk, library, reader, and capture bar are responsive with large touch targets and safe-area-aware layouts.",
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
          <nav
            aria-label="Primary"
            className="hidden items-center gap-6 font-sans text-[13px] font-medium text-ink-soft lg:flex"
          >
            <a
              href="#features"
              className="rounded-sm py-1 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            >
              Features
            </a>
            <a
              href="#reader"
              className="rounded-sm py-1 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            >
              Reader
            </a>
            <a
              href="#organize"
              className="rounded-sm py-1 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            >
              Organize
            </a>
            <a
              href="#faq"
              className="rounded-sm py-1 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            >
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Button type="button" variant="ghost" className="hidden h-10 sm:inline-flex" asChild>
              <Link to="/login/$">Sign In</Link>
            </Button>
            <Button
              type="button"
              className="h-10 rounded-full bg-hanko px-3 text-paper hover:bg-shu sm:px-4"
              asChild
            >
              <Link to="/sign-up/$">
                <span className="sm:hidden">Begin</span>
                <span className="hidden sm:inline">Begin Sanctuary</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="pt-[calc(4rem+env(safe-area-inset-top))]">
        {/* Hero */}
        <section
          aria-labelledby="hero-heading"
          id="philosophy"
          className="relative mx-auto w-full max-w-5xl scroll-mt-24 px-4 pt-10 pb-12 sm:px-6 sm:pt-16"
        >
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <WashiTag tone="paper">Quiet read-later</WashiTag>
                <WashiTag tone="vermilion">Blogs & X threads</WashiTag>
                <WashiTag tone="bamboo">Offline-first</WashiTag>
              </div>
              <h1
                id="hero-heading"
                className="mt-5 font-display text-[2.75rem] leading-[1] font-normal tracking-[-0.025em] text-balance sm:text-[4rem]"
              >
                A quiet digital sanctuary for reading, inking, and unhurried thought.
              </h1>
              <p className="kami-body mt-4 max-w-xl text-base leading-[1.85] text-pretty text-ink-soft sm:text-lg sm:leading-[1.85]">
                Paste a link and get a clean, distraction-free page — then tag it, highlight it in
                three inks, journal it, and find it in seconds.
              </p>
              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  size="lg"
                  className="h-11 w-full rounded-full bg-hanko px-5 text-paper hover:bg-shu sm:w-auto"
                  asChild
                >
                  <Link to="/sign-up/$">
                    Enter the Sanctuary
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
                  <a href="#features">
                    <BookOpen className="size-4" aria-hidden="true" />
                    Explore the Features
                  </a>
                </Button>
              </div>
              <p className="mt-3 font-sans text-xs text-ink-muted" aria-live="polite">
                Free to start · No extension required · Washi light & sumi dark
              </p>
            </div>

            {/* Hero folio — mirrors the real desk: capture bar + fresh saves */}
            <div
              className="relative"
              aria-label="Preview of the KAMI desk, library and reader"
              role="img"
            >
              <div className="kami-sheet-raised kami-grain relative overflow-hidden p-4 sm:p-5">
                <span
                  aria-hidden="true"
                  className="absolute top-0 right-8 h-9 w-3.5 rounded-b-[0.25rem] bg-hanko/90"
                />
                <div className="flex items-center gap-2 border-b border-line pb-3">
                  <Hanko glyph={KAMI_GLYPH} square className="size-7" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold" translate="no">
                      KAMI
                    </p>
                    <p className="kami-label mt-0.5 text-ink-muted">Fresh on the desk</p>
                  </div>
                  <WashiTag tone="vermilion">Inbox</WashiTag>
                </div>
                <div className="kami-sheet mt-3 px-3.5 py-3">
                  <p className="kami-label text-ink-muted">Save a link</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex h-10 flex-1 items-center rounded-lg border border-line bg-bg/60 px-3 font-sans text-sm text-ink-muted">
                      <span className="truncate">Paste a blog or X URL…</span>
                    </div>
                    <span className="rounded-full bg-hanko px-3.5 py-2 font-sans text-sm font-medium text-paper">
                      Save
                    </span>
                  </div>
                </div>
                <ul className="mt-2 divide-y divide-line">
                  {[
                    {
                      tag: "Essay",
                      tone: "bamboo",
                      title: "How to Do Great Work",
                      meta: "14 min · 2h ago",
                    },
                    {
                      tag: "X",
                      tone: "vermilion",
                      title: "Notes on Distribution",
                      meta: "6 min · yesterday",
                    },
                    {
                      tag: "Blog",
                      tone: "indigo",
                      title: "A Field Guide to Focus",
                      meta: "9 min · 3d ago",
                    },
                  ].map((row) => (
                    <li key={row.title} className="flex items-center gap-3 py-2.5">
                      <span
                        className="size-10 shrink-0 rounded-lg bg-paper-warm"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <WashiTag tone={row.tone as "bamboo" | "vermilion" | "indigo"}>
                            {row.tag}
                          </WashiTag>
                          <span className="font-sans text-[11px] text-ink-muted tabular-nums">
                            {row.meta}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate font-display text-[15px] tracking-tight">
                          {row.title}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div
                aria-hidden="true"
                className="kami-sheet-raised absolute -right-3 -bottom-5 hidden w-60 p-4 sm:block"
              >
                <p className="font-display text-sm leading-relaxed italic">
                  “…the calmest way to read the web.”
                </p>
                <p className="kami-label mt-2 text-ink-muted">Dokusho reader · 5 fonts · 3 tones</p>
              </div>
            </div>
          </div>

          <figure className="kami-sheet mx-auto mt-12 max-w-3xl p-6 text-center sm:p-8">
            <blockquote className="font-display text-lg leading-[1.8] text-ink-soft italic sm:text-xl">
              “Teaism is a religion of the art of life… an homage to the fleeting perfection of
              autumn leaves.”
            </blockquote>
            <figcaption className="kami-label mt-3 text-ink-muted">
              The Book of Tea · Okakura Kakuzō — leave one paragraph unread before bed
            </figcaption>
          </figure>
        </section>

        {/* Strip */}
        <section aria-label="Who KAMI is for" className="border-y border-line bg-surface/60">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-4 font-sans text-sm text-ink-muted sm:px-6">
            <span className="kami-label text-ink-soft">Built for</span>
            <span>Essay collectors</span>
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <span>Newsletter skimmers</span>
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <span>X thread savers</span>
            <span aria-hidden="true" className="text-faint">
              ·
            </span>
            <span>Research rabbits</span>
          </div>
        </section>

        {/* Features — real capabilities only */}
        <section
          aria-labelledby="features-heading"
          id="features"
          className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-14 sm:px-6"
        >
          <p className="kami-label text-hanko">Features</p>
          <h2
            id="features-heading"
            className="mt-2 max-w-xl font-display text-3xl font-normal tracking-tight text-balance sm:text-4xl"
          >
            Everything a Reading List Should Do
          </h2>
          <p className="kami-body mt-3 max-w-2xl text-base leading-[1.85] text-ink-soft">
            Capture in one click, read without clutter, and organize without thinking about it.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="kami-sheet group relative overflow-hidden p-5 transition-shadow duration-150 hover:shadow-[var(--shadow-border-hover)]"
              >
                <span
                  aria-hidden="true"
                  className="absolute top-0 right-6 h-7 w-2.5 rounded-b-[0.25rem] bg-hanko/70 opacity-0 transition-opacity group-hover:opacity-100"
                />
                <span className="flex size-10 items-center justify-center rounded-lg bg-paper-warm text-hanko">
                  <f.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-base font-semibold tracking-tight">
                  {f.title}
                </h3>
                <p className="kami-body mt-1.5 text-sm leading-[1.8] text-ink-soft">{f.copy}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section
          aria-labelledby="how-heading"
          id="how-it-works"
          className="scroll-mt-20 border-y border-line bg-surface/60"
        >
          <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
            <p className="kami-label text-hanko">How it works</p>
            <h2
              id="how-heading"
              className="mt-2 max-w-xl font-display text-3xl font-normal tracking-tight text-balance sm:text-4xl"
            >
              From Link to Library in Seconds
            </h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="kami-sheet p-5">
                  <span
                    className="kami-hanko flex size-9 items-center justify-center rounded-full font-display text-base"
                    aria-hidden="true"
                  >
                    {s.n}
                  </span>
                  <h3 className="mt-4 font-display text-base font-semibold tracking-tight">
                    {s.title}
                  </h3>
                  <p className="kami-body mt-1.5 text-sm leading-[1.8] text-ink-soft">{s.copy}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <Button
                type="button"
                size="lg"
                className="h-11 w-full rounded-full bg-hanko px-5 text-paper hover:bg-shu sm:w-auto"
                asChild
              >
                <Link to="/sign-up/$">Try It Now — It’s Free</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="h-11 w-full sm:w-auto"
                asChild
              >
                <Link to="/login/$">I Already Have an Account</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Reader — Dokusho, exactly as built */}
        <section
          aria-labelledby="reader-heading"
          id="reader"
          className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-14 sm:px-6"
        >
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <p className="kami-label text-hanko">Dokusho · Zen reader</p>
              <h2
                id="reader-heading"
                className="mt-2 font-display text-3xl font-normal tracking-tight text-balance sm:text-4xl"
              >
                Read Like It’s Printed for You
              </h2>
              <p className="kami-body mt-3 max-w-lg text-base leading-[1.85] text-ink-soft">
                The browser dissolves into warm paper. Calibrate the sheet, then read at your own
                cadence.
              </p>
              <ul className="kami-body mt-5 space-y-2.5 text-sm text-ink-soft">
                {READER_POINTS.map((r) => (
                  <li key={r.copy} className="flex items-start gap-2.5">
                    <r.icon className="mt-0.5 size-4 shrink-0 text-hanko" aria-hidden="true" />
                    <span>{r.copy}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div
              className="kami-sheet-raised kami-grain relative overflow-hidden p-6 sm:p-8"
              aria-hidden="true"
            >
              <span
                aria-hidden="true"
                className="absolute top-0 right-10 h-10 w-3 rounded-b-[0.25rem] bg-hanko/80"
              />
              <p className="font-display text-xl leading-[1.8] tracking-tight sm:text-2xl">
                “The best interface is the one that disappears — leaving only the words the author
                meant for you.”
              </p>
              <div className="mt-4 flex items-center gap-2">
                {[
                  { id: "vermilion", label: "Vermilion", swatch: "#c84b31" },
                  { id: "bamboo", label: "Bamboo", swatch: "#6e7d6a" },
                  { id: "sumi", label: "Sumi", swatch: "#43403a" },
                ].map((c) => (
                  <span
                    key={c.id}
                    title={c.label}
                    className="h-5 w-10 rounded-full border border-line"
                    style={{ backgroundColor: `color-mix(in oklab, ${c.swatch} 45%, transparent)` }}
                  />
                ))}
                <span className="ml-1 font-sans text-[11px] text-ink-muted">
                  3 inks · notes on every slip
                </span>
              </div>
              <p className="mt-4 font-display text-sm text-ink-muted italic">
                Set in Literata · Pale Washi · Sumi-ready
              </p>
            </div>
          </div>
        </section>

        {/* Organize — journal, vault, shelves as built */}
        <section
          aria-labelledby="organize-heading"
          id="organize"
          className="scroll-mt-20 border-y border-line bg-surface/60"
        >
          <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
            <p className="kami-label text-hanko">Organize</p>
            <h2
              id="organize-heading"
              className="mt-2 max-w-xl font-display text-3xl font-normal tracking-tight text-balance sm:text-4xl"
            >
              Journal, Vault & Shelves
            </h2>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              <div className="kami-sheet p-6">
                <p className="kami-label flex items-center gap-2 text-ink-muted">
                  <MoonStar className="size-3.5 text-hanko" aria-hidden="true" />
                  Nisshi · evening ledger
                </p>
                <p className="kami-body mt-3 text-sm leading-[1.8] text-ink-soft">
                  A month calendar with a micro-season label, up to 50,000 characters a day, and
                  your active reading desk beside the entry — what moved you, what needs to rest
                  overnight.
                </p>
                <p className="kami-label mt-2 text-ink-faint">
                  Paused for now — existing entries stay saved.
                </p>
              </div>
              <div className="kami-sheet p-6">
                <p className="kami-label flex items-center gap-2 text-ink-muted">
                  <Highlighter className="size-3.5 text-hanko" aria-hidden="true" />
                  Tanzaku · slip vault
                </p>
                <p className="kami-body mt-3 text-sm leading-[1.8] text-ink-soft">
                  Every highlight from every article in one vault — filter, search, quote, and
                  download filtered slips as CSV.
                </p>
                <Link
                  to="/vault"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-sm font-sans text-[13px] font-semibold text-hanko hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                >
                  Open Vault <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
              <div className="kami-sheet p-6">
                <p className="kami-label flex items-center gap-2 text-ink-muted">
                  <LibraryBig className="size-3.5 text-hanko" aria-hidden="true" />
                  Tanacho · shelves
                </p>
                <p className="kami-body mt-3 text-sm leading-[1.8] text-ink-soft">
                  Movies, TV shows, books, and a wishlist — TMDB and book search, episode tracking,
                  where-to-watch, and to-try / done states.
                </p>
                <Link
                  to="/shelves/movies"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-sm font-sans text-[13px] font-semibold text-hanko hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                >
                  Open Shelves <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="kami-sheet flex items-center gap-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-paper-warm text-hanko">
                  <Command className="size-5" aria-hidden="true" />
                </span>
                <p className="kami-body text-sm leading-[1.8] text-ink-soft">
                  <span className="font-display font-semibold text-ink">Command palette.</span>{" "}
                  Press ⌘K to jump between desk, library, and reader without touching the mouse.
                </p>
              </div>
              <div className="kami-sheet flex items-center gap-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-paper-warm text-hanko">
                  <ShieldCheck className="size-5" aria-hidden="true" />
                </span>
                <p className="kami-body text-sm leading-[1.8] text-ink-soft">
                  <span className="font-display font-semibold text-ink">Private & portable.</span>{" "}
                  Synced to your account, offline-first, exportable as JSON, OPML, and CSV.
                </p>
              </div>
            </div>

            {/* Theme strip */}
            <div className="kami-sheet-raised mt-4 flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
              <div>
                <p className="kami-label flex items-center gap-2 text-hanko">
                  <SunMoon className="size-3.5" aria-hidden="true" />
                  From morning parchment to midnight pine-smoke
                </p>
                <p className="kami-body mt-1 text-sm text-ink-soft">
                  Washi light and sumi lantern-dark share one token system — flip it here.
                </p>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section
          aria-labelledby="faq-heading"
          id="faq"
          className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 pb-14 sm:px-6"
        >
          <p className="kami-label text-hanko">Colophon · FAQ</p>
          <h2
            id="faq-heading"
            className="mt-2 font-display text-3xl font-normal tracking-tight text-balance sm:text-4xl"
          >
            Questions, Answered
          </h2>
          <div className="kami-sheet mt-6 divide-y divide-line px-5 sm:px-6">
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
          className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6"
        >
          <div className="kami-sheet-raised kami-grain relative overflow-hidden px-6 py-12 text-center sm:px-12">
            <span
              aria-hidden="true"
              className="absolute top-0 right-12 h-12 w-3.5 rounded-b-[0.25rem] bg-hanko"
            />
            <div className="mx-auto flex justify-center">
              <Hanko glyph="S" square className="size-11 text-sm" title="Stillness" />
            </div>
            <h2
              id="cta-heading"
              className="mx-auto mt-4 max-w-xl font-display text-3xl font-normal tracking-tight text-balance sm:text-4xl"
            >
              Step into the stillness. Leave the noise behind.
            </h2>
            <p className="kami-body mx-auto mt-3 max-w-md text-base leading-[1.85] text-ink-soft">
              Join KAMI and turn scattered links into a library you actually finish.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
              <Button
                type="button"
                size="lg"
                className="h-11 w-full rounded-full bg-hanko px-5 text-paper hover:bg-shu sm:w-auto"
                asChild
              >
                <Link to="/sign-up/$">Begin Sanctuary</Link>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-11 w-full border-line bg-surface text-ink hover:bg-paper-warm sm:w-auto"
                asChild
              >
                <Link to="/login/$">Sign In</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface/60">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 font-sans text-sm text-ink-muted sm:px-6 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2">
              <Hanko glyph={KAMI_GLYPH} square className="size-6 text-[10px]" />
              <span className="font-display font-semibold text-ink" translate="no">
                KAMI
              </span>
            </span>
            <p className="kami-body mt-3 max-w-xs text-sm leading-[1.8]">
              Your quiet reading list — washi & thought, set in Newsreader and Inter.
            </p>
          </div>
          <nav aria-label="Sanctuaries">
            <p className="kami-label text-ink-soft">Sanctuaries</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link to="/library" className="hover:text-hanko">
                  Library
                </Link>
              </li>
              <li>
                <Link to="/read" className="hover:text-hanko">
                  Reader
                </Link>
              </li>
              <li>
                <Link to="/vault" className="hover:text-hanko">
                  Vault
                </Link>
              </li>
              <li>
                <Link to="/shelves/movies" className="hover:text-hanko">
                  Shelves
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Craft and philosophy">
            <p className="kami-label text-ink-soft">Craft</p>
            <ul className="mt-3 space-y-2">
              <li>
                <a href="#features" className="hover:text-hanko">
                  Features
                </a>
              </li>
              <li>
                <a href="#reader" className="hover:text-hanko">
                  Reader calibration
                </a>
              </li>
              <li>
                <a href="#organize" className="hover:text-hanko">
                  Journal & shelves
                </a>
              </li>
            </ul>
          </nav>
          <nav aria-label="Colophon">
            <p className="kami-label text-ink-soft">Colophon</p>
            <ul className="mt-3 space-y-2">
              <li>
                <a href="#faq" className="hover:text-hanko">
                  FAQ
                </a>
              </li>
              <li>
                <Link to="/login/$" className="hover:text-hanko">
                  Sign In
                </Link>
              </li>
              <li>
                <span aria-hidden="true">In Praise of Shadows · Tanizaki</span>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
