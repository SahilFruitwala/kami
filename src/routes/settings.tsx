import { createFileRoute } from "@tanstack/react-router";
import { AppGate } from "@/components/app-gate.tsx";
import { DirectionalTransition } from "@/components/directional-transition.tsx";
import { ToolsDialog } from "@/components/library/library-dialogs.tsx";
import { CommandPalette } from "@/components/library/command-palette.tsx";
import { SiteFooter } from "@/components/library/widgets.tsx";
import { SiteHeader } from "@/components/site-header.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import { useCaptureTools } from "@/hooks/use-capture-tools.ts";
import { useLibraryStore, HIGHLIGHT_COLORS, READER_FONTS, READER_FONT_SIZES } from "@/lib/store.ts";
import { PAPER_TONES } from "@/lib/paper-tones.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { RATES } from "@/hooks/use-reader-tts.ts";
import { cn } from "@/lib/utils.ts";
import type { LibraryItem } from "@/lib/store.ts";
import { useNavigate } from "@tanstack/react-router";
import { addTransitionType, startTransition } from "react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppGate>
      <DirectionalTransition>
        <Settings />
      </DirectionalTransition>
    </AppGate>
  );
}

function Settings() {
  const navigate = useNavigate();
  const tools = useCaptureTools();

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  return (
    <main id="main" className="kami-desk relative flex min-h-dvh flex-col overflow-x-hidden [touch-action:manipulation]">
      <a href="#main" className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-ink focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:text-paper">Skip to content</a>
      <SiteHeader active="settings" onOpenTools={() => tools.setToolsOpen(true)} />
      <div className="flex-1">
        <section className="w-full bg-paper/60 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-12">
            <KamiEyebrow>
              Reading Room Rules
              <span className="size-1 rounded-full bg-hanko/40" aria-hidden="true" />
              <span className="text-bamboo">Appearance · Reading · Help</span>
            </KamiEyebrow>
            <h2 className="mt-2 font-display text-3xl tracking-tight text-ink">Settings</h2>
            <p className="mt-2 max-w-xl font-body text-sm leading-relaxed text-ink-soft">
              Full controls live here. Compact versions stay inline in the reader and
              library — both write to the same preferences.
            </p>
            <nav aria-label="Settings sections" className="mt-4 flex flex-wrap gap-2 font-sans text-xs">
              {[
                ["#appearance", "Appearance"],
                ["#reading", "Reading & audio"],
                ["#capture", "Capture"],
                ["#organize", "Organize (soon)"],
                ["#data", "Data (soon)"],
                ["#help", "Help"],
              ].map(([href, label]) => (
                <a key={href} href={href} className="rounded-[0.25rem] bg-surface px-3 py-1.5 text-ink-soft shadow-[var(--shadow-border)] transition-colors hover:bg-paper-warm hover:text-ink">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-12">
          <AppearanceCard />
          <ReadingCard />
          <CaptureCard onOpenTools={() => tools.setToolsOpen(true)} />
          <PlaceholderCard
            id="organize"
            title="Organize — folders & tags"
            copy="Rename, merge, and delete folders and tags from one table. Coming in P1 — for now, manage folders from the Library filter row and tags from any open work."
          />
          <PlaceholderCard
            id="data"
            title="Data — export & account"
            copy="Library JSON, OPML, Vault CSV, and account export/delete land here in P1. Vault markdown export already lives on the Vault page."
          />
          <HelpCard />
        </div>
      </div>
      <SiteFooter />
      <ToolsDialog open={tools.toolsOpen} onOpenChange={tools.setToolsOpen} bookmarklet={tools.bookmarklet} />
      <CommandPalette onOpenItem={openItem} />
    </main>
  );
}

function Card({ id, title, copy, children }: { id: string; title: string; copy: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={title} className="kami-sheet scroll-mt-24 p-6 sm:p-8">
      <h3 className="font-display text-xl text-ink">{title}</h3>
      <p className="mt-1 max-w-2xl font-body text-sm leading-relaxed text-ink-muted">{copy}</p>
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="kami-label text-ink-muted">{children}</p>;
}

function AppearanceCard() {
  const { theme, isSystem, setTheme, followSystem } = useTheme();
  const readerFontSize = useLibraryStore((s) => s.readerFontSize);
  const readerFont = useLibraryStore((s) => s.readerFont);
  const highlightColor = useLibraryStore((s) => s.highlightColor);
  const paperTone = useLibraryStore((s) => s.paperTone);
  const bumpReaderFontSize = useLibraryStore((s) => s.bumpReaderFontSize);
  const setReaderFont = useLibraryStore((s) => s.setReaderFont);
  const setHighlightColor = useLibraryStore((s) => s.setHighlightColor);
  const setPaperTone = useLibraryStore((s) => s.setPaperTone);

  return (
    <Card id="appearance" title="Appearance" copy="Theme, paper, and type. Mirrors the reader preferences popover — change it here or there.">
      <div>
        <FieldLabel>Theme</FieldLabel>
        <div className="mt-2 inline-flex rounded-lg bg-paper-warm p-1" role="group" aria-label="Color theme">
          {(
            [
              ["light", "Light"],
              ["dark", "Dark"],
              ["system", "System"],
            ] as const
          ).map(([id, label]) => {
            const active = id === "system" ? isSystem : theme === id && !isSystem;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => (id === "system" ? followSystem() : setTheme(id))}
                className={cn(
                  "rounded-md px-4 py-1.5 font-sans text-xs transition-colors",
                  active ? "bg-surface font-semibold text-hanko shadow-sm" : "text-ink-soft hover:text-ink",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <FieldLabel>Paper tone</FieldLabel>
        <div className="mt-2 grid max-w-lg grid-cols-3 gap-2" role="group" aria-label="Paper tone">
          {PAPER_TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={paperTone === t.id}
              onClick={() => setPaperTone(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                paperTone === t.id ? "bg-paper-warm shadow-xs ring-1 ring-hanko/40" : "bg-bg/60 hover:bg-paper-warm/70",
              )}
            >
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md text-xs font-bold" style={{ backgroundColor: t.bg, color: t.fg, border: "1px solid var(--color-line)" }}>
                {t.glyph}
              </span>
              <span className="font-sans text-xs font-medium text-ink">{t.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <FieldLabel>Reader font</FieldLabel>
          <div className="mt-2 grid gap-1">
            {READER_FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={readerFont === f.id}
                onClick={() => setReaderFont(f.id)}
                style={{ fontFamily: f.family }}
                className={cn(
                  "rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  readerFont === f.id ? "bg-paper-warm font-semibold text-ink shadow-xs" : "text-ink-soft hover:bg-paper-warm/60 hover:text-ink",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Text size & highlight</FieldLabel>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" aria-label="Decrease font size" disabled={readerFontSize <= 0} onClick={() => bumpReaderFontSize(-1)} className="flex size-9 items-center justify-center rounded-lg bg-paper-warm text-ink disabled:opacity-40">
              −
            </button>
            <div className="flex flex-1 items-center justify-center gap-1.5" aria-hidden="true">
              {READER_FONT_SIZES.map((_, i) => (
                <span key={i} className={cn("h-2 w-2 rounded-full", i === readerFontSize ? "scale-125 bg-ink" : "bg-faint")} />
              ))}
            </div>
            <button type="button" aria-label="Increase font size" disabled={readerFontSize >= READER_FONT_SIZES.length - 1} onClick={() => bumpReaderFontSize(1)} className="flex size-9 items-center justify-center rounded-lg bg-paper-warm text-ink disabled:opacity-40">
              +
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Default highlight color">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.label}
                title={c.label}
                aria-pressed={highlightColor === c.id}
                onClick={() => setHighlightColor(c.id)}
                style={{ background: c.swatch }}
                className={cn(
                  "size-8 rounded-full border-2 transition-transform",
                  highlightColor === c.id ? "scale-110 border-ink ring-2 ring-ink/30" : "border-transparent hover:scale-105",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ReadingCard() {
  const ttsRate = useLibraryStore((s) => s.ttsRate);
  const setTtsRate = useLibraryStore((s) => s.setTtsRate);
  const resumeEnabled = useLibraryStore((s) => s.resumeEnabled);
  const setResumeEnabled = useLibraryStore((s) => s.setResumeEnabled);

  return (
    <Card id="reading" title="Reading & audio" copy="Listen speed and scroll-resume. Voice pick stays in the reader where voices can be previewed.">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="settings-tts-rate" className="font-sans text-sm font-medium text-ink">Listen speed</label>
        <select
          id="settings-tts-rate"
          value={String(ttsRate)}
          onChange={(e) => setTtsRate(Number(e.target.value))}
          className="h-10 rounded-lg bg-surface px-2 text-sm font-medium text-ink shadow-[var(--shadow-border)]"
        >
          {RATES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={resumeEnabled} onChange={(e) => setResumeEnabled(e.target.checked)} className="mt-1 size-4 accent-[#a6331b]" />
        <span>
          <span className="font-sans text-sm font-medium text-ink">Offer scroll-resume in the reader</span>
          <span className="block font-body text-sm text-ink-muted">When reopening a work past 8%, show a Resume / Start over pill. Progress is stored on-device only.</span>
        </span>
      </label>
    </Card>
  );
}

function CaptureCard({ onOpenTools }: { onOpenTools: () => void }) {
  return (
    <Card id="capture" title="Capture" copy="Blocked pages? Capture in your browser, then import. Bookmarklets need a desktop bookmark bar — on mobile use Paste article.">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onOpenTools} className="rounded-[0.25rem] bg-hanko px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-sm hover:bg-shu">
          Open capture tools
        </button>
        <a href="#help" className="rounded-[0.25rem] bg-paper-warm px-5 py-2.5 font-sans text-sm font-medium text-ink hover:bg-line">
          How capturing works →
        </a>
      </div>
    </Card>
  );
}

function PlaceholderCard({ id, title, copy }: { id: string; title: string; copy: string }) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-24 rounded-[0.25rem] border border-dashed border-line bg-surface/60 p-6 sm:p-8">
      <h3 className="font-display text-xl text-ink">{title}</h3>
      <p className="mt-1 max-w-2xl font-body text-sm leading-relaxed text-ink-muted">{copy}</p>
    </section>
  );
}

function HelpCard() {
  return (
    <Card id="help" title="Help — your first evening with Kami" copy="Three steps to a quiet desk. This same guide appears when your desk is empty.">
      <ol className="grid gap-3 md:grid-cols-3">
        {[
          ["1 · Bind a link", "Paste a blog or X URL on Home. Kami keeps a clean, distraction-free copy."],
          ["2 · Ink a passage", "Select any passage in the reader. It is pressed into the Highlight Vault as a slip."],
          ["3 · Find it in seconds", "Filter the Library, or press ⌘K to jump to works, highlights, and tags."],
        ].map(([t, c]) => (
          <li key={t} className="rounded-[0.25rem] bg-bg/60 p-4">
            <p className="font-sans text-sm font-semibold text-ink">{t}</p>
            <p className="mt-1 font-body text-sm leading-relaxed text-ink-muted">{c}</p>
          </li>
        ))}
      </ol>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[0.25rem] bg-bg/60 p-4">
          <p className="font-sans text-sm font-semibold text-ink">Keyboard</p>
          <ul className="mt-1 space-y-1 font-sans text-xs text-ink-muted">
            <li><kbd className="rounded bg-paper-warm px-1.5 py-0.5">⌘/Ctrl K</kbd> — command palette</li>
            <li><kbd className="rounded bg-paper-warm px-1.5 py-0.5">G</kbd> then <kbd className="rounded bg-paper-warm px-1.5 py-0.5">H/L/V/S</kbd> — Home / Library / Vault / Settings</li>
          </ul>
        </div>
        <div className="rounded-[0.25rem] bg-bg/60 p-4">
          <p className="font-sans text-sm font-semibold text-ink">Capture troubleshooting</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 font-body text-sm text-ink-muted">
            <li>Bot wall? Use the bookmarklet on desktop or Paste article anywhere.</li>
            <li>Truncated import? Try a smaller article section.</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
