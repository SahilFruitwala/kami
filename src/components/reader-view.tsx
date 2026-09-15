import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, ViewTransition } from "react";
import { ArrowLeft, ArrowRight, BookmarkPlus, ExternalLink, Eye, PenLine, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { Article } from "@/lib/article-types.ts";
import { applyHighlights } from "@/lib/highlight-html.ts";
import { rewriteHtmlImages, previewImageSrc } from "@/lib/image-url.ts";
import {
  READER_FONTS,
  READER_FONT_SIZES,
  useLibraryStore,
  type HighlightColorId,
  type LibraryItem,
} from "@/lib/store.ts";
import { OrganizeRow } from "@/components/organize-row.tsx";
import { HighlightMenu } from "@/components/reader/highlight-menu.tsx";
import { ReaderBody } from "@/components/reader/reader-body.tsx";
import { ReaderHeader } from "@/components/reader/reader-header.tsx";
import { ReaderPrefsPanel } from "@/components/reader/reader-prefs.tsx";
import { WashiTag } from "@/components/kami.tsx";
import { useReaderProgress, useSelectionMenu } from "@/hooks/use-reader-selection.ts";
import { useReaderTts } from "@/hooks/use-reader-tts.ts";
import { TONES } from "@/lib/paper-tones.ts";
import { cn } from "@/lib/utils.ts";

export function ReaderView({
  item,
  article,
  onBack,
  onArchive,
  onOpenItem,
}: {
  item: LibraryItem;
  article: Article;
  onBack: () => void;
  onArchive: () => void;
  onOpenItem?: (item: LibraryItem) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const prefsRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [zen, setZen] = useState(false);
  const hasLeadImage = /<img\b/i.test(article.contentHtml.slice(0, 1200));

  const library = useLibraryStore((s) => s.library);
  const readerFontSize = useLibraryStore((s) => s.readerFontSize);
  const readerFont = useLibraryStore((s) => s.readerFont);
  const highlightColor = useLibraryStore((s) => s.highlightColor);
  const paperTone = useLibraryStore((s) => s.paperTone);
  const setPaperTone = useLibraryStore((s) => s.setPaperTone);
  const resumeEnabled = useLibraryStore((s) => s.resumeEnabled);
  const savedProgress = useLibraryStore((s) => s.progressById[item.id] ?? 0);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const bumpReaderFontSize = useLibraryStore((s) => s.bumpReaderFontSize);
  const setReaderFont = useLibraryStore((s) => s.setReaderFont);
  const setHighlightColor = useLibraryStore((s) => s.setHighlightColor);
  const addHighlight = useLibraryStore((s) => s.addHighlight);
  const removeHighlight = useLibraryStore((s) => s.removeHighlight);
  const setHighlightNote = useLibraryStore((s) => s.setHighlightNote);
  const setFavorited = useLibraryStore((s) => s.setFavorited);
  const setItemNote = useLibraryStore((s) => s.setItemNote);

  const fontSizeRem = READER_FONT_SIZES[readerFontSize] ?? READER_FONT_SIZES[2];
  const fontFamily = READER_FONTS.find((f) => f.id === readerFont)?.family;

  const html = useMemo(
    () => applyHighlights(rewriteHtmlImages(article.contentHtml), item.highlights),
    [article.contentHtml, item.highlights],
  );

  const progress = useReaderProgress(article.canonicalUrl, item.id);
  const { menu, onSelectEnd, clearMenu } = useSelectionMenu(article.canonicalUrl, bodyRef);
  const tts = useReaderTts(article.canonicalUrl, bodyRef);

  const percent = Math.round(progress * 100);
  const showResume =
    resumeEnabled &&
    !resumeDismissed &&
    savedProgress > 0.08 &&
    savedProgress < 0.95 &&
    progress < 0.05;

  function resumeReading() {
    const el = document.documentElement;
    const max = el.scrollHeight - el.clientHeight;
    window.scrollTo({ top: Math.round(savedProgress * max), behavior: "instant" as ScrollBehavior });
    setResumeDismissed(true);
  }

  async function shareArticle() {
    const url = article.canonicalUrl || article.url;
    const data = { title: article.title, text: article.title, url };
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied — share it anywhere");
    } catch {
      // user dismissed share sheet or clipboard blocked — stay quiet
    }
  }

  const nextItem = useMemo(() => {
    const sorted = [...library]
      .filter((row) => !row.archived)
      .sort((a, b) => b.savedAt - a.savedAt);
    const idx = sorted.findIndex((row) => row.id === item.id);
    return idx >= 0 ? (sorted[idx + 1] ?? sorted[0] ?? null) : null;
  }, [library, item.id]);

  useEffect(() => {
    if (!prefsOpen) return;
    function onPointer(event: PointerEvent) {
      if (prefsRef.current?.contains(event.target as Node)) return;
      setPrefsOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPrefsOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [prefsOpen]);

  function onBodyClick(event: MouseEvent<HTMLDivElement>) {
    const selected = window.getSelection()?.toString().trim() || "";
    if (selected.length >= 8) return;
    activateBodyTarget(event.target as HTMLElement, event);
  }

  function onBodyKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement;
    if (!target.closest("mark") && !target.closest("a")) return;
    event.preventDefault();
    activateBodyTarget(target, event);
  }

  function activateBodyTarget(target: HTMLElement, event: { preventDefault: () => void }) {
    const mark = target.closest("mark");
    if (mark?.getAttribute("data-hid")) {
      document
        .getElementById("inked-passages")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const link = target.closest("a");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href");
    if (href && /^https?:\/\//i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }

  function saveHighlight(color?: HighlightColorId) {
    if (!menu) return;
    addHighlight(item.id, menu.text, color ?? highlightColor);
    window.getSelection()?.removeAllRanges();
    clearMenu();
    toast.success("Passage inked onto washi");
  }

  async function exportToJournal() {
    const lines = [
      `# ${article.title}`,
      `${article.author ? `By ${article.author} · ` : ""}${article.siteName || ""}`,
      "",
      ...item.highlights.map((h) => `> ${h.text}${h.note ? `\n> \n> — marginalia: ${h.note}` : ""}`),
      ...(item.note ? ["", `Notes: ${item.note}`] : []),
      "",
      `Source: ${article.canonicalUrl || article.url}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Reading exported — paste it into your journal");
    } catch {
      toast.error("Export failed — copy the passages manually and try again");
    }
  }

  const sheet = TONES[paperTone] ?? TONES.pale;
  const sheetStyle = {
    backgroundColor: sheet.bg,
    color: sheet.fg,
    border: "1px solid var(--color-line)",
    colorScheme: sheet.scheme,
    ...sheet.vars,
  } as CSSProperties;

  return (
    <div className="kami-desk relative min-h-dvh [touch-action:manipulation]">
      {/* Reading progress — vermilion ink */}
      <div
        role="progressbar"
        aria-label="Reading progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        title={`${percent}% read`}
        className="fixed inset-x-0 top-0 z-50 h-0.5 bg-line"
      >
        <div
          className="h-full bg-hanko transition-[width] duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>

      {showResume ? (
        <div className="fixed top-3 left-1/2 z-50 flex w-[92%] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-full bg-ink px-4 py-2 text-paper shadow-[var(--shadow-raised)]" role="status">
          <p className="truncate font-sans text-xs">
            Resume at {Math.round(savedProgress * 100)}%?
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={resumeReading}
              className="rounded-full bg-paper px-3 py-1 font-sans text-xs font-semibold text-ink"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={() => setResumeDismissed(true)}
              className="font-sans text-xs text-paper/70 underline underline-offset-2 hover:text-paper"
            >
              Start over
            </button>
          </div>
        </div>
      ) : null}

      <ReaderHeader
        favorited={item.favorited}
        archived={item.archived}
        canSpeak={tts.canSpeak}
        tts={tts.tts}
        listenOpen={tts.listenOpen}
        word={tts.word}
        voices={tts.voices}
        ttsRate={tts.ttsRate}
        ttsVoiceURI={tts.ttsVoiceURI}
        prefsOpen={prefsOpen}
        prefsRef={prefsRef}
        onBack={() => {
          tts.stopTts();
          onBack();
        }}
        onToggleListen={tts.toggleListen}
        onStopTts={tts.stopTts}
        onToggleFavorite={() => {
          setFavorited(item.id, !item.favorited);
          toast.success(item.favorited ? "Removed from favorites" : "Favorited");
        }}
        onTogglePrefs={() => setPrefsOpen((open) => !open)}
        onArchive={onArchive}
        onTtsRate={tts.setTtsRate}
        onTtsVoice={tts.setTtsVoiceURI}
        prefsPanel={
          <ReaderPrefsPanel
            readerFontSize={readerFontSize}
            readerFont={readerFont}
            highlightColor={highlightColor}
            paperTone={paperTone}
            onBumpSize={bumpReaderFontSize}
            onFont={setReaderFont}
            onHighlightColor={setHighlightColor}
            onPaperTone={setPaperTone}
          />
        }
      />

      {menu ? (
        <HighlightMenu menu={menu} activeColor={highlightColor} onSave={saveHighlight} />
      ) : null}

      <div className="mx-auto w-full max-w-6xl px-4 pt-6 pb-32 sm:px-6">
        {/* Reading sheet */}
        <div
          className="relative rounded-xl p-6 shadow-[var(--shadow-raised)] transition-colors duration-300 sm:p-8 lg:p-12"
          style={sheetStyle}
        >
          <div className="absolute top-0 right-12 flex flex-col items-center" aria-hidden="true">
            <div className="flex h-12 w-6 items-center justify-center bg-hanko shadow-sm">
              <BookmarkPlus className="size-[14px] text-white" />
            </div>
            <div className="size-0 border-x-[12px] border-t-[8px] border-x-transparent border-t-hanko" />
          </div>

          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-10">
            <article className="min-w-0 max-w-[680px] lg:col-span-8">
              <header className="space-y-4 pb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <WashiTag tone="paper">{article.source === "x" ? "X" : article.siteName || "Article"}</WashiTag>
                  <span className="text-xs text-current opacity-50" aria-hidden="true">·</span>
                  <span className="font-sans text-[11px] text-current opacity-60">
                    {article.readingMinutes} min read
                  </span>
                </div>
                <ViewTransition name={`article-title-${item.id}`} share="text-morph">
                  <h1
                    className="font-display text-3xl leading-tight tracking-tight sm:text-4xl"
                    style={{ fontFamily }}
                  >
                    {article.title}
                  </h1>
                </ViewTransition>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 font-sans text-xs opacity-70">
                  {[article.author, article.siteName].filter(Boolean).join(" · ") ? (
                    <span className="font-medium opacity-100">
                      {[article.author, article.siteName].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 text-hanko">
                    <span className="inline-block size-2 rounded-full bg-hanko" aria-hidden="true" />
                    {item.highlights.length} Inked Passage{item.highlights.length === 1 ? "" : "s"}
                  </span>
                </div>
              </header>

              <OrganizeRow item={item} />

              {article.heroImage && !hasLeadImage ? (
                <ViewTransition name={`article-image-${item.id}`} share="morph">
                  <figure className="my-6">
                    <img
                      src={previewImageSrc(article.heroImage)}
                      alt=""
                      width="1200"
                      height="630"
                      loading="lazy"
                      decoding="async"
                      className="aspect-[16/9] w-full rounded-xl object-cover shadow-sm"
                    />
                  </figure>
                </ViewTransition>
              ) : null}

              <ReaderBody
                html={html}
                fontSizeRem={fontSizeRem}
                fontId={readerFont}
                onSelectEnd={onSelectEnd}
                onClick={onBodyClick}
                onKeyDown={onBodyKeyDown}
                bodyRef={bodyRef}
              />

              <MarginaliaHighlights
                item={item}
                onNote={(highlightId, note) => setHighlightNote(item.id, highlightId, note)}
                onRemove={(highlightId) => {
                  const snapshot = item.highlights.find((h) => h.id === highlightId);
                  removeHighlight(item.id, highlightId);
                  if (snapshot) {
                    toast.success("Highlight removed", {
                      action: {
                        label: "Undo",
                        onClick: () => {
                          const restored = addHighlight(item.id, snapshot.text, snapshot.color);
                          if (restored && snapshot.note) setHighlightNote(item.id, restored.id, snapshot.note);
                        },
                      },
                    });
                  }
                }}
                onExport={() => void exportToJournal()}
              />

              <footer className="mt-10">
                <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium opacity-60">
                  <span className="flex items-center gap-2">
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                    <a
                      href={article.canonicalUrl || article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 transition-colors hover:text-hanko"
                    >
                      View Original Article
                    </a>
                  </span>
                  <button
                    type="button"
                    onClick={() => void shareArticle()}
                    className="flex items-center gap-1.5 underline underline-offset-2 transition-colors hover:text-hanko"
                  >
                    <Share2 className="size-3.5 shrink-0" aria-hidden="true" />
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 underline underline-offset-2 transition-colors hover:text-hanko"
                  >
                    <Printer className="size-3.5 shrink-0" aria-hidden="true" />
                    Print
                  </button>
                </p>
              </footer>
            </article>

            {/* Marginalia gutter */}
            <aside
              className="flex min-w-0 flex-col gap-6 transition-opacity duration-300 lg:col-span-4 lg:sticky lg:top-24"
              style={{ opacity: zen ? 0.1 : 1 }}
              aria-label="Marginalia and reflection notes"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-sans text-[11px] font-semibold tracking-wider uppercase opacity-60">
                  <PenLine className="size-[18px] shrink-0" aria-hidden="true" />
                  Marginalia &amp; Glanures
                </p>
                <span className="shrink-0 rounded-full bg-hanko/10 px-2 py-0.5 font-sans text-[11px] text-hanko">
                  {item.highlights.length + (item.note ? 1 : 0)} Reflections
                </span>
              </div>

              {item.highlights.length === 0 && !item.note ? (
                <p className="rounded-xl bg-ink/5 p-4 font-body text-sm italic opacity-70">
                  Select any passage to ink it — your thoughts will gather in this margin.
                </p>
              ) : null}

              {item.highlights.map((h) => (
                <div
                  key={h.id}
                  className="space-y-2 rounded-xl bg-ink/5 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1 font-sans text-[11px] font-semibold text-hanko">
                      <span className="size-1.5 shrink-0 rounded-full bg-hanko" aria-hidden="true" />
                      <span className="truncate">
                        On “{h.text.slice(0, 32)}{h.text.length > 32 ? "…" : ""}”
                      </span>
                    </span>
                  </div>
                  <p className="font-body text-sm leading-snug break-words text-current italic opacity-80">
                    “{h.text}”
                  </p>
                  {h.note ? (
                    <p className="font-body text-sm leading-snug break-words">{h.note}</p>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        document
                          .getElementById("inked-passages")
                          ?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }
                      className="font-sans text-[11px] text-current underline underline-offset-2 opacity-60 transition-opacity hover:opacity-100"
                    >
                      Add a note below ↓
                    </button>
                  )}
                </div>
              ))}

              <label className="block rounded-xl bg-ink/5 p-4 shadow-sm">
                <span className="kami-label opacity-60">Reading Note</span>
                <textarea
                  ref={notesRef}
                  value={item.note || ""}
                  onChange={(e) => setItemNote(item.id, e.target.value)}
                  placeholder="Private notes for this article…"
                  className="mt-2 min-h-24 w-full bg-transparent font-body text-sm outline-none placeholder:italic placeholder:opacity-50 focus-visible:ring-2 focus-visible:ring-hanko/40 rounded-md"
                />
              </label>

              <button
                type="button"
                onClick={() => notesRef.current?.focus()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink/5 px-4 py-3 font-sans text-xs font-medium shadow-sm transition-colors hover:bg-ink/10 active:scale-[0.99]"
              >
                + Add thought to this margin
              </button>

              <div className="space-y-3 rounded-xl bg-ink/5 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="kami-label opacity-60">Focus Rhythm</span>
                  <span className="font-sans text-[11px] font-medium text-ok">
                    {percent}% · {percent > 60 ? "Deep State" : percent > 20 ? "Settling In" : "Opening"}
                  </span>
                </div>
                <FocusWave percent={percent} />
                <p className="font-body text-xs leading-normal opacity-70">
                  {percent > 60
                    ? "Your reading velocity has slowed around the midpoint — ideal for internalizing nuance."
                    : "Early in the scroll — let the first passages settle like sediment in clear water."}
                </p>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Floating zen dock */}
      <div className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[90%] max-w-2xl -translate-x-1/2 items-center justify-between gap-6 rounded-full bg-surface/95 px-6 py-3 shadow-[var(--shadow-raised)] backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to library"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-paper-warm text-ink-soft transition-colors hover:text-hanko"
          >
            <ArrowLeft className="size-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => nextItem && onOpenItem?.(nextItem)}
            disabled={!nextItem || !onOpenItem}
            className="flex min-w-0 flex-col text-left disabled:opacity-60"
          >
            <span className="kami-label truncate text-ink-muted">Next In Scroll</span>
            <span className="truncate font-sans text-xs font-medium text-ink">
              {nextItem ? nextItem.title : "End of the scroll"}
            </span>
          </button>
          {nextItem && onOpenItem ? (
            <ArrowRight className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setZen((v) => !v)}
            aria-pressed={zen}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-xs transition-colors",
              zen ? "bg-hanko text-white" : "bg-paper-warm text-ink-soft hover:text-ink",
            )}
          >
            <Eye className="size-[18px]" aria-hidden="true" />
            <span className="hidden sm:inline">Zen Focus</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFavorited(item.id, !item.favorited);
              toast.success(item.favorited ? "Ribbon removed" : "Ribbon placed — find it under Favorites");
            }}
            className="flex items-center gap-1.5 rounded-full bg-hanko px-3.5 py-1.5 font-sans text-xs font-medium text-white shadow-sm transition-all hover:bg-shu active:scale-95"
          >
            <BookmarkPlus className="size-[18px]" aria-hidden="true" />
            <span className="hidden sm:inline">Place Ribbon</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Decorative attention wave with the reading position dotted on the curve.
 *  Everything is inset from the viewBox edges so nothing clips. */
function FocusWave({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  // Piecewise-linear sampling of the wave's key points for the dot position.
  const keys: Array<[number, number]> = [
    [6, 27],
    [34, 15],
    [62, 20],
    [80, 9],
    [94, 14],
  ];
  const x = 6 + (clamped / 100) * 88;
  let y = keys[keys.length - 1]![1];
  for (let i = 1; i < keys.length; i++) {
    const [x0, y0] = keys[i - 1]!;
    const [x1, y1] = keys[i]!;
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      y = y0 + t * (y1 - y0);
      break;
    }
  }
  return (
    <svg
      viewBox="0 0 100 36"
      className="h-12 w-full overflow-visible text-ok/60"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M6,27 Q20,24 34,15 T62,20 T80,9 T94,14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x} cy={y} r="3.5" className="fill-hanko" />
    </svg>
  );
}

function MarginaliaHighlights({
  item,
  onNote,
  onRemove,
  onExport,
}: {
  item: LibraryItem;
  onNote: (highlightId: string, note: string) => void;
  onRemove: (highlightId: string) => void;
  onExport: () => void;
}) {
  if (item.highlights.length === 0) {
    return (
      <p className="mt-12 font-body text-sm italic opacity-60">
        Select a passage to highlight it — inked slips gather in the Highlight Vault.
      </p>
    );
  }
  return (
    <section id="inked-passages" className="mt-14 scroll-mt-32" aria-label="Highlights">
      <div className="flex items-center gap-4 opacity-40">
        <span className="h-px w-12 bg-current" aria-hidden="true" />
        <span className="font-display text-sm tracking-widest uppercase">End</span>
        <span className="h-px w-12 bg-current" aria-hidden="true" />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl">Inked Passages</h2>
        <button
          type="button"
          onClick={onExport}
          className="flex items-center gap-1.5 rounded-[0.25rem] bg-hanko px-3 py-1.5 font-sans text-xs font-medium text-white shadow-sm transition-colors hover:bg-shu active:translate-y-px"
        >
          <PenLine className="size-3.5" aria-hidden="true" />
          Export to Journal
        </button>
      </div>
      <ul className="mt-4 space-y-4">
        {item.highlights.map((highlight) => (
          <li key={highlight.id} className="rounded-[0.25rem] bg-ink/5 p-4 shadow-sm">
            <p className="hl-quote rounded-sm px-1.5 py-0.5 font-body text-base leading-normal italic" data-hl={highlight.color}>
              {highlight.text}
            </p>
            <label className="mt-2 block">
              <span className="sr-only">Note for highlight</span>
              <input
                value={highlight.note}
                onChange={(e) => onNote(highlight.id, e.target.value)}
                placeholder="Add a marginalia note…"
                className="h-10 w-full rounded-[0.25rem] border border-line bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-hanko/30"
              />
            </label>
            <button
              type="button"
              className="mt-2 text-xs text-ink-muted underline underline-offset-2 hover:text-hanko"
              onClick={() => onRemove(highlight.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
