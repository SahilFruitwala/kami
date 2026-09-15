import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  countWords,
  formatDay,
  keyForOffset,
  todayKey,
  useJournalStore,
} from "@/lib/journal.ts";
import { cn } from "@/lib/utils.ts";

export const Route = createFileRoute("/journal")({
  component: JournalPage,
});

function JournalPage() {
  return <Journal />;
}

const DAY_OFFSETS = [0, -1, -2, -3, -4, -5, -6];

function Journal() {
  const [activeDate, setActiveDate] = useState(() => todayKey());
  const entries = useJournalStore((s) => s.entries);
  const setEntry = useJournalStore((s) => s.setEntry);
  const [draft, setDraft] = useState(() => entries[todayKey()]?.text ?? "");
  const [savedFlash, setSavedFlash] = useState(false);

  // Swap the draft when the day changes; autosave on keystroke (debounced).
  useEffect(() => {
    setDraft(entries[activeDate]?.text ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate]);

  useEffect(() => {
    if (draft === (entries[activeDate]?.text ?? "")) return;
    const t = setTimeout(() => {
      setEntry(activeDate, draft);
      setSavedFlash(true);
      const clear = setTimeout(() => setSavedFlash(false), 1500);
      return () => clearTimeout(clear);
    }, 600);
    return () => clearTimeout(t);
  }, [draft, activeDate, entries, setEntry]);

  const words = useMemo(() => countWords(draft), [draft]);
  const streak = useMemo(() => {
    let n = 0;
    for (let i = 0; ; i += 1) {
      const text = entries[keyForOffset(-i)]?.text.trim();
      if (!text) break;
      n += 1;
    }
    return n;
  }, [entries]);
  const totalWords = useMemo(
    () => Object.values(entries).reduce((n, e) => n + countWords(e.text), 0),
    [entries],
  );

  const { label } = formatDay(activeDate);

  return (
    <AppShell active="journal" onOpenItem={() => undefined}>
      <section className="w-full bg-paper/60 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-12">
          <KamiEyebrow>
            Daily Journal
            <span className="size-1 rounded-full bg-hanko/40" aria-hidden="true" />
            <span className="text-bamboo">
              {streak > 0 ? `${streak}-day streak` : "a quiet page"}
            </span>
          </KamiEyebrow>
          <h2 className="mt-2 flex flex-wrap items-center gap-3 font-display text-3xl tracking-tight text-ink">
            Journal
          </h2>

          <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Days">
            {DAY_OFFSETS.map((offset) => {
              const key = keyForOffset(offset);
              const day = formatDay(key);
              const hasInk = Boolean(entries[key]?.text.trim());
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={activeDate === key}
                  onClick={() => setActiveDate(key)}
                  className={cn(
                    "flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-[0.25rem] px-2 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                    activeDate === key
                      ? "bg-paper-warm font-semibold text-ink"
                      : "text-ink-muted hover:bg-paper-warm hover:text-ink",
                  )}
                >
                  <span className="font-sans text-[10px] tracking-wider uppercase">{day.weekday}</span>
                  <span className="font-display text-base">{day.label}</span>
                  <span
                    className={cn("size-1 rounded-full", hasInk ? "bg-hanko" : "bg-line")}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-12">
        <div className="kami-sheet p-6 sm:p-8">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-xl text-ink">{label}</p>
            <p className="font-sans text-xs text-ink-muted" role="status">
              {savedFlash ? "Sealed into the journal" : `${words} words · ${totalWords} total`}
            </p>
          </div>
          <label htmlFor="journal-ink" className="sr-only">
            Write today&apos;s entry
          </label>
          <Textarea
            id="journal-ink"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What thought from today lingers most deeply as the light settles?"
            rows={14}
            className="mt-4 border-0 bg-transparent p-0 font-serif text-[17px] leading-relaxed shadow-none focus-visible:ring-0"
          />
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <p className="kami-label text-ink-faint">Auto-saved on this device</p>
            <span className="kami-hanko flex size-8 items-center justify-center rounded-full font-display text-xs font-semibold" title="Inked">
              ✓
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
