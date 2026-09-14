import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  BookMarked,
  BookOpen,
  Highlighter,
  LibraryBig,
  MousePointerClick,
  Search,
  Sparkles,
  Tags,
} from "lucide-react";
import { SignInButton, SignUpButton } from "@/lib/auth/gates";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle.tsx";

// Hoisted static content — no per-render allocation (rendering-hoist-jsx).
const FEATURES = [
  {
    icon: BookOpen,
    title: "Clean Reading View",
    copy: "Strip clutter and read blogs and X articles in a calm, book-like page with your choice of fonts.",
  },
  {
    icon: Highlighter,
    title: "Highlights That Stick",
    copy: "Mark passages in five colors and revisit every highlight from one place. Quote or export anytime.",
  },
  {
    icon: Tags,
    title: "Tags & Folders",
    copy: "File pieces into folders, tag them, star favorites, and filter your library in one keystroke-free pass.",
  },
  {
    icon: Search,
    title: "Instant Search",
    copy: "Search titles, excerpts, tags, and notes as you type. Results stay responsive with deferred rendering.",
  },
  {
    icon: MousePointerClick,
    title: "Bookmarklet Capture",
    copy: "One click saves the page you are reading — even when a site blocks server-side scraping.",
  },
  {
    icon: LibraryBig,
    title: "Inbox & Archive Flow",
    copy: "Triage new saves in your inbox, archive finished reads, and keep the queue honest.",
  },
] as const;

const STEPS = [
  {
    n: "1",
    title: "Save a Link",
    copy: "Paste any blog or X article URL — or fire the bookmarklet from the page itself.",
  },
  {
    n: "2",
    title: "Read Without Noise",
    copy: "Open the distilled article view with adjustable type, progress, and highlights.",
  },
  {
    n: "3",
    title: "File & Find Later",
    copy: "Tag it, folder it, star it. Search brings it back in milliseconds.",
  },
] as const;

const FAQS = [
  {
    q: "What can I save to Quarto?",
    a: "Public blog posts and X articles. Paste the URL and Quarto extracts a clean reading copy with title, excerpt, hero image, and body text.",
  },
  {
    q: "What happens when a site blocks scraping?",
    a: "Save the link anyway, paste the article text manually, or use the bookmarklet — your browser already has the page, so nothing is lost.",
  },
  {
    q: "Do I need an account?",
    a: "Yes. Your library, tags, folders, favorites, and highlights sync to your account so every device stays in step.",
  },
  {
    q: "Is my library private?",
    a: "Yes. Your saves stay in your account on this app. Nothing is published or shared unless you choose to.",
  },
  {
    q: "Does Quarto work on mobile?",
    a: "Yes. The library, reader, and capture bar are responsive with large touch targets and safe-area-aware layouts.",
  },
] as const;

export function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-paper text-ink [touch-action:manipulation]">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-ink focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-paper"
      >
        Skip to content
      </a>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-paper-warm)_75%,transparent),transparent)]"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <span className="flex size-8 items-center justify-center rounded-md bg-ink text-paper">
            <BookMarked className="size-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Quarto</span>
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm text-ink-soft md:flex">
          <a href="#features" className="rounded-sm transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
            Features
          </a>
          <a href="#how-it-works" className="rounded-sm transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
            How It Works
          </a>
          <a href="#faq" className="rounded-sm transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <SignInButton mode="modal">
            <Button type="button" variant="ghost" className="h-10">
              Sign In
            </Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button type="button" className="h-10">
              Get Started
            </Button>
          </SignUpButton>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section aria-labelledby="hero-heading" className="relative mx-auto w-full max-w-5xl px-4 pt-10 pb-12 sm:px-6 sm:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-paper-warm px-3 py-1 text-xs font-medium text-ink-soft">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Quiet Read-Later for Blogs &amp; X
              </p>
              <h1
                id="hero-heading"
                className="mt-4 font-display text-4xl leading-[1.1] tracking-tight text-balance sm:text-5xl"
              >
                Save Anything Worth Reading. Actually Read It.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-pretty text-ink-soft sm:text-lg">
                Paste a link and get a clean, distraction-free page — then tag it, highlight it,
                and find it in seconds. Your second brain for the open web.
              </p>
              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <SignUpButton mode="modal">
                  <Button type="button" size="lg" className="w-full sm:w-auto">
                    <Bookmark className="size-4" aria-hidden="true" />
                    Start Your Library
                  </Button>
                </SignUpButton>
                <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto" asChild>
                  <a href="#how-it-works">See How It Works</a>
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted" aria-live="polite">
                Free to start · No extension required · Works on mobile &amp; desktop
              </p>
            </div>

            {/* Product mock — pure CSS, zero image cost, no CLS */}
            <div className="relative" aria-label="Preview of the Quarto library and reader" role="img">
              <div className="rounded-2xl bg-surface p-4 shadow-device sm:p-5">
                <div className="flex items-center gap-2 border-b border-line pb-3">
                  <span className="flex size-7 items-center justify-center rounded-md bg-ink text-paper">
                    <BookMarked className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">Quarto</p>
                    <p className="text-xs text-muted">Save &amp; read later</p>
                  </div>
                  <span className="rounded-full bg-paper-warm px-2.5 py-1 text-xs text-ink-soft">
                    12 saved
                  </span>
                </div>
                <div className="mt-3 rounded-xl bg-paper px-3.5 py-3 shadow-border">
                  <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
                    Save a link
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex h-9 flex-1 items-center rounded-md bg-surface px-3 text-sm text-muted shadow-border">
                      <span className="truncate">Paste a blog or X URL…</span>
                    </div>
                    <span className="rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-paper">
                      Save
                    </span>
                  </div>
                </div>
                <ul className="mt-2 divide-y divide-line">
                  {[
                    { tag: "Essay", title: "How to Do Great Work", meta: "14 min · 2h ago" },
                    { tag: "X", title: "Notes on Distribution", meta: "6 min · yesterday" },
                    { tag: "Blog", title: "A Field Guide to Focus", meta: "9 min · 3d ago" },
                  ].map((row) => (
                    <li key={row.title} className="flex items-center gap-3 py-2.5">
                      <span className="size-10 shrink-0 rounded-md bg-paper-warm" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="rounded-full bg-paper-warm px-2 py-0.5 text-[11px] text-ink-soft">
                            {row.tag}
                          </span>
                          <span className="text-[11px] text-muted tabular-nums">{row.meta}</span>
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
                className="absolute -right-3 -bottom-5 hidden w-56 rounded-xl bg-ink p-4 text-paper shadow-device sm:block"
              >
                <p className="font-display text-sm italic">“…the calmest way to read the web.”</p>
                <p className="mt-2 text-[11px] text-paper/70">Distraction-free reader · 5 fonts</p>
              </div>
            </div>
          </div>
        </section>

        {/* Strip */}
        <section aria-label="Who Quarto is for" className="border-y border-line bg-surface/60">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-4 text-sm text-muted sm:px-6">
            <span className="font-medium text-ink-soft">Built for</span>
            <span>Essay collectors</span>
            <span aria-hidden="true" className="text-faint">·</span>
            <span>Newsletter skimmers</span>
            <span aria-hidden="true" className="text-faint">·</span>
            <span>X thread savers</span>
            <span aria-hidden="true" className="text-faint">·</span>
            <span>Research rabbits</span>
          </div>
        </section>

        {/* Features */}
        <section aria-labelledby="features-heading" id="features" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">Features</p>
          <h2 id="features-heading" className="mt-2 max-w-xl font-display text-3xl tracking-tight text-balance sm:text-4xl">
            Everything a Reading List Should Do
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-soft">
            Capture in one click, read without clutter, and organize without thinking about it.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li
                key={f.title}
                className="rounded-2xl bg-surface p-5 shadow-border transition-shadow duration-150 hover:shadow-border-hover"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-paper-warm text-ink">
                  <f.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{f.copy}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-heading" id="how-it-works" className="border-y border-line bg-surface/60 scroll-mt-20">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
            <p className="text-xs font-semibold tracking-widest text-muted uppercase">How It Works</p>
            <h2 id="how-heading" className="mt-2 max-w-xl font-display text-3xl tracking-tight text-balance sm:text-4xl">
              From Link to Library in Seconds
            </h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => (
                <li key={s.n} className="rounded-2xl bg-paper p-5 shadow-border">
                  <span className="flex size-9 items-center justify-center rounded-full bg-ink font-display text-base text-paper" aria-hidden="true">
                    {s.n}
                  </span>
                  <h3 className="mt-4 text-base font-semibold tracking-tight">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{s.copy}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <SignUpButton mode="modal">
                <Button type="button" size="lg" className="w-full sm:w-auto">
                  Try It Now — It’s Free
                </Button>
              </SignUpButton>
              <Button type="button" variant="ghost" size="lg" className="w-full sm:w-auto" asChild>
                <Link to="/login">I Already Have an Account</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Reader note */}
        <section aria-labelledby="reader-heading" className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold tracking-widest text-muted uppercase">Reader</p>
              <h2 id="reader-heading" className="mt-2 font-display text-3xl tracking-tight text-balance sm:text-4xl">
                Read Like It’s Printed for You
              </h2>
              <p className="mt-3 max-w-lg text-base leading-relaxed text-ink-soft">
                Five book-grade typefaces, adjustable size, progress tracking, and highlights in
                five colors — with light and dark themes that respect your system setting.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-ink-soft">
                <li className="flex items-start gap-2.5">
                  <Highlighter className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden="true" />
                  <span>Highlight passages and collect them per article or in one highlights view.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Tags className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden="true" />
                  <span>Tag and file while you read — organization never interrupts the flow.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <BookOpen className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden="true" />
                  <span>Pick up where you left off with per-article scroll memory.</span>
                </li>
              </ul>
            </div>
            <div className="rounded-2xl bg-surface p-6 shadow-border sm:p-8" aria-hidden="true">
              <p className="font-display text-xl leading-relaxed tracking-tight sm:text-2xl">
                “The best interface is the one that disappears — leaving only the words the
                author meant for you.”
              </p>
              <div className="mt-4 flex items-center gap-1.5">
                {(["amber", "lemon", "mint", "sky", "rose"] as const).map((c) => (
                  <span
                    key={c}
                    data-hl={c}
                    className="hl-quote h-5 w-10 rounded-full border border-line"
                  />
                ))}
              </div>
              <p className="mt-4 font-display text-sm text-muted italic">Set in Newsreader, 19px, 1.65 line height</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq-heading" id="faq" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 pb-14 sm:px-6">
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">FAQ</p>
          <h2 id="faq-heading" className="mt-2 font-display text-3xl tracking-tight text-balance sm:text-4xl">
            Questions, Answered
          </h2>
          <div className="mt-6 divide-y divide-line rounded-2xl bg-surface px-5 shadow-border sm:px-6">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[15px] font-medium tracking-tight hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 rounded-sm [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden="true" className="text-xl leading-none text-muted transition-transform duration-150 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section aria-labelledby="cta-heading" className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
          <div className="rounded-3xl bg-ink px-6 py-12 text-center text-paper sm:px-12">
            <h2 id="cta-heading" className="mx-auto max-w-xl font-display text-3xl tracking-tight text-balance sm:text-4xl">
              Stop Losing Great Reads to Open Tabs
            </h2>
            <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-paper/75">
              Join Quarto and turn scattered links into a library you actually finish.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
              <SignUpButton mode="modal">
                <Button
                  type="button"
                  size="lg"
                  className="w-full bg-paper text-ink hover:bg-paper-warm sm:w-auto"
                >
                  Create Free Account
                </Button>
              </SignUpButton>
              <SignInButton mode="modal">
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  className="w-full border-paper/25 bg-transparent text-paper hover:bg-paper/10 hover:text-paper sm:w-auto"
                >
                  Sign In
                </Button>
              </SignInButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-start justify-between gap-3 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:px-6">
          <span className="inline-flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-ink text-paper">
              <BookMarked className="size-3.5" aria-hidden="true" />
            </span>
            <span translate="no">Quarto</span> — your quiet reading list.
          </span>
          <nav aria-label="Footer" className="flex items-center gap-5">
            <a href="#features" className="rounded-sm transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">Features</a>
            <a href="#faq" className="rounded-sm transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">FAQ</a>
            <Link to="/login" className="rounded-sm transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30">Sign In</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
