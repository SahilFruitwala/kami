import { createFileRoute } from "@tanstack/react-router";
import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  countWords,
  formatDay,
  isDateKey,
  keyForOffset,
  todayKey,
  useJournalStore,
} from "@/lib/journal.ts";
import {
  pendingJournalSyncCount,
  subscribeJournalOutbox,
} from "@/lib/journal-remote.ts";
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
  const [focusMode, setFocusMode] = useState(false);
  const [pending, setPending] = useState(pendingJournalSyncCount);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  const weekKeys = useMemo(() => new Set(DAY_OFFSETS.map((o) => keyForOffset(o))), []);

  function selectDate(next: string) {
    if (!isDateKey(next) || next === activeDate) return;
    if (draft !== (entries[activeDate]?.text ?? "")) {
      setEntry(activeDate, draft);
    }
    setActiveDate(next);
  }

  // Swap the draft when the day changes. Do not depend on `entries` —
  // a persist write mid-keystroke would clobber newer text.
  useEffect(() => {
    setDraft(entries[activeDate]?.text ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate]);

  useEffect(() => {
    if (draft === (entries[activeDate]?.text ?? "")) return;
    const t = setTimeout(() => {
      setEntry(activeDate, draft);
      setSavedFlash(true);
    }, 600);
    return () => clearTimeout(t);
  }, [draft, activeDate, entries, setEntry]);

  useEffect(() => {
    if (!savedFlash) return;
    const clear = setTimeout(() => setSavedFlash(false), 1500);
    return () => clearTimeout(clear);
  }, [savedFlash]);

  useEffect(() => {
    const unsub = subscribeJournalOutbox(setPending);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      unsub();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!focusMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

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
  const olderDates = useMemo(
    () =>
      Object.values(entries)
        .filter((e) => e.text.trim() && !weekKeys.has(e.date))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 12)
        .map((e) => e.date),
    [entries, weekKeys],
  );

  const { label, longLabel } = formatDay(activeDate);
  const dirty = draft !== (entries[activeDate]?.text ?? "");
  const saveLabel = !online
    ? "Offline — will sync"
    : pending > 0 || dirty
      ? "Saving…"
      : savedFlash
        ? "Saved"
        : "Saved";

  return (
    <AppShell active="journal" onOpenItem={() => undefined}>
      {!focusMode ? (
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
                    onClick={() => selectDate(key)}
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

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="kami-label flex items-center gap-2 text-ink-muted">
                <span>Jump to</span>
                <input
                  type="date"
                  value={activeDate}
                  max={todayKey()}
                  onChange={(e) => {
                    if (e.target.value) selectDate(e.target.value);
                  }}
                  className="rounded-[0.25rem] border border-line bg-paper px-2 py-1 font-sans text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                />
              </label>
              {olderDates.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {olderDates.map((key) => {
                    const day = formatDay(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => selectDate(key)}
                        className={cn(
                          "rounded-[0.25rem] px-2 py-1 font-sans text-[11px] tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                          activeDate === key
                            ? "bg-paper-warm text-ink"
                            : "text-ink-muted hover:bg-paper-warm hover:text-ink",
                        )}
                      >
                        {day.label} {key.slice(0, 4)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <div
        className={cn(
          "mx-auto w-full px-4 py-8 sm:px-6 lg:px-12",
          focusMode ? "max-w-3xl pt-6" : "max-w-3xl",
        )}
      >
        <div className="kami-sheet p-6 sm:p-8">
          <div
            className={cn(
              "flex items-baseline justify-between gap-3",
              focusMode && "sticky top-0 z-10 -mx-6 bg-paper/90 px-6 py-3 backdrop-blur-sm sm:-mx-8 sm:px-8",
            )}
          >
            <p className="font-display text-xl text-ink">{focusMode ? longLabel : label}</p>
            <div className="flex items-center gap-3">
              <p className="font-sans text-xs text-ink-muted" role="status">
                {savedFlash && online && pending === 0 && !dirty
                  ? "Sealed into the journal"
                  : `${words} words · ${totalWords} total`}
              </p>
              <button
                type="button"
                onClick={() => setFocusMode((v) => !v)}
                className="text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                aria-pressed={focusMode}
                aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
                title={focusMode ? "Exit focus (Esc)" : "Focus mode"}
              >
                {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </button>
            </div>
          </div>
          <label htmlFor="journal-ink" className="sr-only">
            Write today&apos;s entry
          </label>
          <Textarea
            id="journal-ink"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What thought from today lingers most deeply as the light settles?"
            rows={focusMode ? 22 : 18}
            className="mt-4 min-h-[22rem] border-0 bg-transparent p-0 font-serif text-[17px] leading-relaxed shadow-none focus-visible:ring-0"
          />
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <p className="kami-label text-ink-faint">{saveLabel}</p>
            <span className="kami-hanko flex size-8 items-center justify-center rounded-full font-display text-xs font-semibold" title="Inked">
              ✓
            </span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
