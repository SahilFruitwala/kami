import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Moon, PlusCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  countWords,
  isDateKey,
  LONG_INSCRIPTION_WORDS,
  monthCells,
  moonPhaseLabel,
  parseDateKey,
  seasonLabel,
  todayKey,
  useJournalStore,
  wafuMonth,
} from "@/lib/journal.ts";
import {
  pendingJournalSyncCount,
  subscribeJournalOutbox,
} from "@/lib/journal-remote.ts";
import { useLibraryStore, type Highlight, type LibraryItem } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

export const Route = createFileRoute("/journal")({
  component: JournalPage,
});

function JournalPage() {
  return <Journal />;
}

type KigiTab = "today" | "recent" | "notes";
type Slip = { item: LibraryItem; highlight: Highlight };

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function Journal() {
  const [activeDate, setActiveDate] = useState(() => todayKey());
  const entries = useJournalStore((s) => s.entries);
  const setEntry = useJournalStore((s) => s.setEntry);
  const library = useLibraryStore((s) => s.library);
  const [draft, setDraft] = useState(() => entries[todayKey()]?.text ?? "");
  const [savedFlash, setSavedFlash] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [pending, setPending] = useState(pendingJournalSyncCount);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [kigiTab, setKigiTab] = useState<KigiTab>("today");
  const active = parseDateKey(activeDate);
  const [viewYear, setViewYear] = useState(() => active.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => active.getMonth());

  function selectDate(next: string) {
    if (!isDateKey(next) || next === activeDate) return;
    if (next > todayKey()) return;
    if (draft !== (entries[activeDate]?.text ?? "")) {
      setEntry(activeDate, draft);
    }
    setActiveDate(next);
    const d = parseDateKey(next);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

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
  const dirty = draft !== (entries[activeDate]?.text ?? "");
  const saveLabel = !online
    ? "Offline — will sync"
    : pending > 0 || dirty
      ? "Saving…"
      : "Saved";

  const cells = useMemo(() => monthCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const season = seasonLabel(activeDate);
  const moon = moonPhaseLabel(activeDate);
  const monthTitle = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const slips = useMemo<Slip[]>(() => {
    const rows: Slip[] = [];
    for (const item of library) {
      for (const highlight of item.highlights ?? []) {
        if (highlight.text.trim()) rows.push({ item, highlight });
      }
    }
    rows.sort((a, b) => b.highlight.createdAt - a.highlight.createdAt);
    return rows;
  }, [library]);

  const startOfActive = parseDateKey(activeDate).setHours(0, 0, 0, 0);
  const endOfActive = startOfActive + 86400000;

  const kigiSlips = useMemo(() => {
    if (kigiTab === "notes") return slips.filter((s) => s.highlight.note.trim());
    if (kigiTab === "today") {
      const todaySlips = slips.filter(
        (s) => s.highlight.createdAt >= startOfActive && s.highlight.createdAt < endOfActive,
      );
      return todaySlips.length ? todaySlips : slips.filter((s) => s.highlight.note.trim()).slice(0, 6);
    }
    return slips.slice(0, 8);
  }, [slips, kigiTab, startOfActive, endOfActive]);

  const openWorks = useMemo(
    () =>
      [...library]
        .filter((item) => !item.archived && (item.highlights?.length || item.note))
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, 2),
    [library],
  );

  function insertSlip(slip: Slip) {
    const cite = [
      "",
      `"${slip.highlight.text.trim()}"`,
      `— ${slip.item.author || slip.item.siteName || "Unknown"}, ${slip.item.title}`,
      "",
    ].join("\n");
    setDraft((prev) => (prev.trim() ? `${prev.trimEnd()}\n${cite}` : cite.trimStart()));
  }

  function sealEntry() {
    setEntry(activeDate, draft);
    setSavedFlash(true);
  }

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  return (
    <AppShell active="journal" onOpenItem={() => undefined}>
      <div className="mx-auto w-full max-w-7xl overflow-x-hidden px-4 py-8 sm:px-6 lg:px-12">
        <div className={cn("grid gap-6", focusMode ? "grid-cols-1" : "lg:grid-cols-12")}>
          {!focusMode ? (
            <aside className="flex flex-col gap-6 lg:col-span-4">
              <div className="kami-sheet space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display text-xl font-medium tracking-tight text-ink">{monthTitle}</p>
                    <p className="kami-label mt-0.5 text-ink-muted">{wafuMonth(viewMonth)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => shiftMonth(-1)}
                      className="rounded-[0.25rem] p-1.5 text-ink-muted hover:bg-paper-warm hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                      aria-label="Previous month"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftMonth(1)}
                      className="rounded-[0.25rem] p-1.5 text-ink-muted hover:bg-paper-warm hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                      aria-label="Next month"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {WEEKDAYS.map((d) => (
                    <span key={d} className="kami-label py-1 text-ink-faint">
                      {d}
                    </span>
                  ))}
                  {cells.map((cell) => {
                    const text = entries[cell.key]?.text ?? "";
                    const wc = countWords(text);
                    const selected = cell.key === activeDate;
                    const today = cell.key === todayKey();
                    const future = cell.key > todayKey();
                    const long = wc >= LONG_INSCRIPTION_WORDS;
                    const inked = wc > 0;
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        disabled={future || !cell.inMonth}
                        onClick={() => selectDate(cell.key)}
                        className={cn(
                          "relative rounded-[0.25rem] py-1.5 font-sans text-sm transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                          !cell.inMonth && "text-ink-faint/40",
                          cell.inMonth && !selected && "text-ink-muted hover:bg-paper-warm",
                          selected && "scale-105 bg-hanko font-bold text-white shadow-sm",
                          today && !selected && "font-semibold text-ink",
                          future && "cursor-default opacity-40",
                        )}
                      >
                        {cell.day}
                        {inked && cell.inMonth && !selected ? (
                          <span
                            className={cn(
                              "absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full",
                              long ? "bg-hanko/70" : "bg-bamboo",
                            )}
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between border-t border-line pt-2 font-sans text-[10px] tracking-wider text-ink-muted uppercase">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-bamboo" />
                    Reflective Entry
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-hanko/70" />
                    Long Inscription
                  </span>
                </div>
              </div>

              <div className="kami-sheet space-y-5 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-lg font-semibold text-ink">Kigi Drawer</p>
                    <span className="rounded-[0.25rem] bg-paper-warm px-2 py-0.5 font-sans text-[10px] tracking-wider text-ink-muted uppercase">
                      {slips.length} Clipped
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      ["today", "Today's Inklings"],
                      ["recent", "Recent Reads"],
                      ["notes", "Untangled Notes"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setKigiTab(id)}
                      className={cn(
                        "whitespace-nowrap rounded-full px-3 py-1 font-sans text-[11px] tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                        kigiTab === id
                          ? "bg-paper-warm font-medium text-ink"
                          : "text-ink-muted hover:bg-paper-warm hover:text-ink",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="space-y-4">
                  {kigiSlips.length === 0 ? (
                    <p className="font-body text-sm leading-relaxed text-ink-muted italic">
                      Ink a passage in the reader — clippings gather here for today&apos;s page.
                    </p>
                  ) : (
                    kigiSlips.slice(0, 6).map((slip, index) => (
                      <KigiCard
                        key={`${slip.item.id}-${slip.highlight.id}`}
                        slip={slip}
                        tape={index % 3}
                        onInsert={() => insertSlip(slip)}
                      />
                    ))
                  )}
                </div>
                {openWorks.length > 0 ? (
                  <div className="border-t border-line pt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="kami-label text-ink-faint">Active Reading Desk</span>
                      <span className="font-sans text-[11px] font-medium text-bamboo">
                        {openWorks.length} {openWorks.length === 1 ? "Work" : "Works"} Open
                      </span>
                    </div>
                    <div className="space-y-2">
                      {openWorks.map((item) => (
                        <div key={item.id} className="flex items-center gap-3">
                          {item.heroImage ? (
                            <img
                              src={item.heroImage}
                              alt=""
                              className="h-14 w-10 rounded-[0.25rem] object-cover shadow-sm"
                            />
                          ) : (
                            <div className="flex h-14 w-10 items-center justify-center rounded-[0.25rem] bg-paper-warm font-display text-xs text-hanko">
                              Kami
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-sans text-[11px] font-semibold text-ink">{item.title}</p>
                            <p className="truncate font-sans text-[11px] text-ink-muted">
                              {item.author || item.siteName || "On the desk"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </aside>
          ) : null}

          <section className={cn("flex flex-col gap-6", focusMode ? "col-span-1" : "lg:col-span-8")}>
            <div className="kami-sheet flex flex-col justify-between gap-4 border-b border-hanko/10 p-6 sm:flex-row sm:items-center">
              <div className={cn("space-y-1", focusMode && "sticky top-14 z-10")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="kami-label font-bold tracking-widest text-hanko">HONJITSU</span>
                  <span className="text-ink-faint">•</span>
                  <span className="inline-flex items-center gap-1 font-sans text-[11px] tracking-wide text-bamboo">
                    <Moon className="size-3.5" aria-hidden="true" />
                    {moon}
                  </span>
                </div>
                <h2 className="font-display text-2xl font-medium tracking-tight text-ink sm:text-[26px]">
                  {parseDateKey(activeDate).toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}{" "}
                  · {season.en} ({season.ja})
                </h2>
              </div>
              <div className="flex items-center gap-3 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => setFocusMode((v) => !v)}
                  className="rounded-[0.25rem] p-2 text-ink-muted transition-colors hover:bg-paper-warm hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                  aria-pressed={focusMode}
                  aria-label={focusMode ? "Exit deep focus" : "Enter deep focus"}
                  title={focusMode ? "Exit focus (Esc)" : "Deep Focus Mode"}
                >
                  {focusMode ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </button>
                <span
                  className="flex size-12 rotate-[2deg] flex-col items-center justify-center rounded-[0.25rem] border-2 border-hanko/80 bg-hanko/5 text-hanko shadow-sm"
                  title="Inked"
                >
                  <span className="font-display text-lg font-semibold leading-none">記</span>
                </span>
              </div>
            </div>

            <div className="kami-sheet relative p-6 sm:p-8">
              <label htmlFor="journal-ink" className="sr-only">
                Write today&apos;s entry
              </label>
              <Textarea
                id="journal-ink"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="What thought from your morning reading lingers most deeply in your mind as the light settles?"
                rows={focusMode ? 24 : 18}
                className="no-scrollbar min-h-[28rem] resize-none overflow-x-hidden overflow-y-auto border-0 bg-transparent p-4 font-body text-[18px] leading-[1.85] text-ink shadow-none [field-sizing:fixed] placeholder:text-ink-muted/70 focus-visible:ring-0"
              />
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="kami-label text-ink-faint" role="status">
                  {savedFlash && online && pending === 0 && !dirty
                    ? "Sealed into the journal"
                    : `${saveLabel} · ${words} words`}
                </p>
                <button
                  type="button"
                  onClick={sealEntry}
                  className="inline-flex items-center gap-2 rounded-[0.25rem] bg-hanko px-4 py-2 font-sans text-sm font-semibold text-white shadow-sm transition hover:bg-shu focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                >
                  Seal today&apos;s thoughts
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function KigiCard({
  slip,
  tape,
  onInsert,
}: {
  slip: Slip;
  tape: number;
  onInsert: () => void;
}) {
  const tapeClass =
    tape === 0
      ? "left-1/2 -translate-x-1/2 rotate-[-1.5deg] bg-bamboo-wash"
      : tape === 1
        ? "left-1/3 -translate-x-1/2 rotate-[1deg] bg-shu-tint"
        : "right-6 rotate-[-2deg] bg-bamboo-wash";
  return (
    <div className="group relative rounded-[0.25rem] bg-paper-warm/70 p-4 pt-5 shadow-sm">
      <div
        className={cn(
          "pointer-events-none absolute -top-2.5 h-4 w-14 border-t border-b border-dashed border-bamboo/20 shadow-sm",
          tapeClass,
        )}
        aria-hidden="true"
      />
      <p className="font-body text-sm leading-relaxed text-ink italic">
        &ldquo;{slip.highlight.text.trim()}&rdquo;
      </p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/60 pt-3">
        <span className="min-w-0 truncate font-sans text-[11px] text-ink-muted">
          {slip.item.author || slip.item.siteName || "Untitled"} ·{" "}
          <span className="font-body italic">{slip.item.title}</span>
        </span>
        <button
          type="button"
          onClick={onInsert}
          className="inline-flex shrink-0 items-center gap-1 rounded-[0.25rem] border border-hanko/20 bg-paper px-2.5 py-1 font-sans text-[11px] text-hanko transition hover:bg-hanko hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
        >
          <PlusCircle className="size-3.5" />
          Insert
        </button>
      </div>
    </div>
  );
}
