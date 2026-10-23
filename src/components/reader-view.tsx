import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  ViewTransition,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  ExternalLink,
  Eye,
  EyeOff,
  PenLine,
  Printer,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import type { Article } from "@/lib/article-types.ts";
import { applyHighlights } from "@/lib/highlight-html.ts";
import { rewriteHtmlImages, previewImageSrc } from "@/lib/image-url.ts";
import { useLibraryStore } from "@/lib/store.ts";
import { READER_FONTS, READER_FONT_SIZES, useReaderPrefs } from "@/lib/reader-prefs.ts";
import type { HighlightColorId, LibraryItem } from "@/lib/library-item.ts";
import { OrganizeRow } from "@/components/organize-row.tsx";
import { HighlightMenu } from "@/components/reader/highlight-menu.tsx";
import { ReaderBody } from "@/components/reader/reader-body.tsx";
import { ReaderHeader } from "@/components/reader/reader-header.tsx";
import {
  NarrationButton,
  NarrationPlayer,
  NarrationRefusalDialog,
} from "@/components/reader/narration.tsx";
import { useNarration } from "@/hooks/use-narration.ts";
import { ReaderPrefsPanel } from "@/components/reader/reader-prefs.tsx";
import { WashiTag } from "@/components/kami.tsx";
import { highlightMenu, type EditMenu } from "@/lib/selection-menu.ts";
import { useReaderProgress, useSelectionMenu } from "@/hooks/use-reader-selection.ts";
import { TONES } from "@/lib/paper-tones.ts";
import { cn } from "@/lib/utils.ts";
import { FocusWave } from "@/components/reader/focus-wave.tsx";
import { MarginaliaHighlights } from "@/components/reader/marginalia-highlights.tsx";
import { ReaderAi } from "@/components/reader/reader-ai.tsx";
import { nextInQueue } from "@/lib/filter-library.ts";

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

  // Select only the next item, so unrelated library changes don't re-render the reader.
  const nextItem = useLibraryStore((s) => nextInQueue(s.library, item.id));
  const readerFontSize = useReaderPrefs((s) => s.readerFontSize);
  const readerFont = useReaderPrefs((s) => s.readerFont);
  const highlightColor = useReaderPrefs((s) => s.highlightColor);
  const paperTone = useReaderPrefs((s) => s.paperTone);
  const setPaperTone = useReaderPrefs((s) => s.setPaperTone);
  const resumeEnabled = useReaderPrefs((s) => s.resumeEnabled);
  const savedProgress = useReaderPrefs((s) => s.progressById[item.id] ?? 0);
  const narration = useNarration(item);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const bumpReaderFontSize = useReaderPrefs((s) => s.bumpReaderFontSize);
  const setReaderFont = useReaderPrefs((s) => s.setReaderFont);
  const setHighlightColor = useReaderPrefs((s) => s.setHighlightColor);
  const addHighlight = useLibraryStore((s) => s.addHighlight);
  const removeHighlight = useLibraryStore((s) => s.removeHighlight);
  const restoreHighlight = useLibraryStore((s) => s.restoreHighlight);
  const setHighlightColorById = useLibraryStore((s) => s.setHighlightColorById);
  const setHighlightNote = useLibraryStore((s) => s.setHighlightNote);
  const setFavorited = useLibraryStore((s) => s.setFavorited);
  const setItemNote = useLibraryStore((s) => s.setItemNote);
  /** Anchored to a tapped highlight — recolor or remove inline. */
  const [editMenu, setEditMenu] = useState<EditMenu | null>(null);

  const fontSizeRem = READER_FONT_SIZES[readerFontSize] ?? READER_FONT_SIZES[2];
  const fontFamily = READER_FONTS.find((f) => f.id === readerFont)?.family;

  const html = useMemo(
    () => applyHighlights(rewriteHtmlImages(article.contentHtml), item.highlights),
    [article.contentHtml, item.highlights],
  );

  const progress = useReaderProgress(article.canonicalUrl, item.id);
  const {
    menu,
    onSelectEnd: onSelectEndRaw,
    clearMenu,
  } = useSelectionMenu(article.canonicalUrl, bodyRef);

  /** New text selection wins — dismiss the tap-to-edit menu. */
  function handleSelectEnd() {
    setEditMenu(null);
    onSelectEndRaw();
  }

  // Keep the edit menu glued to its highlight while scrolling; drop it if gone.
  useEffect(() => {
    if (!editMenu) return;
    const highlightId = editMenu.highlightId;
    function onScroll() {
      const mark = bodyRef.current?.querySelector(`mark[data-hid="${highlightId}"]`);
      if (!mark) {
        setEditMenu(null);
        return;
      }
      const next = highlightMenu(highlightId, mark);
      if (next) setEditMenu(next);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [editMenu]);

  // Make highlights keyboard-activatable so Enter/Space reopens their options.
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    root.querySelectorAll("mark[data-hid]").forEach((el) => {
      const mark = el as HTMLElement;
      mark.tabIndex = 0;
      mark.setAttribute("role", "button");
      mark.setAttribute("aria-label", "Edit highlight");
    });
  }, [html]);

  // Escape dismisses either floating menu.
  useEffect(() => {
    if (!editMenu && !menu) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setEditMenu(null);
        window.getSelection()?.removeAllRanges();
        clearMenu();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editMenu, menu, clearMenu]);

  const editingHighlight = editMenu
    ? (item.highlights.find((h) => h.id === editMenu.highlightId) ?? null)
    : null;

  // The highlight was removed elsewhere (vault, marginalia) — drop the menu.
  useEffect(() => {
    if (editMenu && !editingHighlight) setEditMenu(null);
  }, [editMenu, editingHighlight]);

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
    window.scrollTo({
      top: Math.round(savedProgress * max),
      behavior: "instant" as ScrollBehavior,
    });
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

  useEffect(() => {
    if (!zen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setZen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [zen]);

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
    // Clicks on the floating toolbar itself belong to its buttons.
    if ((event.target as HTMLElement).closest("[data-highlight-menu]")) return;
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

  /** Tap a highlight to reopen its ink options; tap a link to open it. */
  function activateBodyTarget(target: HTMLElement, event: { preventDefault: () => void }) {
    const mark = target.closest("mark");
    const hid = mark?.getAttribute("data-hid");
    if (mark && hid) {
      event.preventDefault();
      clearMenu();
      window.getSelection()?.removeAllRanges();
      const next = highlightMenu(hid, mark);
      setEditMenu(next);
      return;
    }
    // Tapped plain text — dismiss the edit menu, then handle links.
    setEditMenu(null);
    const link = target.closest("a");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href");
    if (href && /^https?:\/\//i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }

  /** Ink the selection in the picked color. */
  function saveHighlight(color?: HighlightColorId) {
    if (!menu) return;
    addHighlight(item.id, menu.text, color ?? highlightColor);
    window.getSelection()?.removeAllRanges();
    clearMenu();
    setEditMenu(null);
  }

  /** Recolor the tapped highlight inline — no trip to the bottom needed. */
  function recolorEditingHighlight(color: HighlightColorId) {
    if (!editMenu) return;
    setHighlightColorById(item.id, editMenu.highlightId, color);
    setEditMenu(null);
  }

  /** Remove a highlight (and its note), offering a one-tap undo. */
  function removeHighlightWithUndo(highlightId: string) {
    const removed = item.highlights.find((h) => h.id === highlightId);
    removeHighlight(item.id, highlightId);
    if (!removed) return;
    toast.success("Highlight removed", {
      action: { label: "Undo", onClick: () => restoreHighlight(item.id, removed) },
    });
  }

  /** Remove the tapped highlight inline. */
  function removeEditingHighlight() {
    if (!editMenu) return;
    removeHighlightWithUndo(editMenu.highlightId);
    setEditMenu(null);
  }

  async function exportToJournal() {
    const lines = [
      `# ${article.title}`,
      `${article.author ? `By ${article.author} · ` : ""}${article.siteName || ""}`,
      "",
      ...item.highlights.map(
        (h) => `> ${h.text}${h.note ? `\n> \n> — marginalia: ${h.note}` : ""}`,
      ),
      ...(item.note ? ["", `Notes: ${item.note}`] : []),
      "",
      `Source: ${article.canonicalUrl || article.url}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Reading copied to clipboard");
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
      {/* Reading progress — hidden in zen so only text remains */}
      {!zen ? (
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
      ) : null}

      {showResume && !zen ? (
        <div
          className="fixed top-3 left-1/2 z-50 flex w-[92%] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-full bg-ink px-4 py-2 text-paper shadow-[var(--shadow-raised)]"
          role="status"
        >
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

      {zen ? null : (
        <ReaderHeader
          favorited={item.favorited}
          archived={item.archived}
          prefsOpen={prefsOpen}
          prefsRef={prefsRef}
          onBack={onBack}
          onToggleFavorite={() => {
            setFavorited(item.id, !item.favorited);
            toast.success(item.favorited ? "Removed from favorites" : "Favorited");
          }}
          onTogglePrefs={() => setPrefsOpen((open) => !open)}
          onArchive={onArchive}
          narration={<NarrationButton narration={narration} />}
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
      )}

      {menu ? (
        <HighlightMenu menu={menu} onInk={saveHighlight} />
      ) : editMenu && editingHighlight ? (
        <HighlightMenu
          menu={editMenu}
          activeColor={editingHighlight.color}
          onInk={recolorEditingHighlight}
          onRemove={removeEditingHighlight}
        />
      ) : null}

      <div
        className={cn(
          "g-reader-in mx-auto w-full px-4 pb-32 sm:px-6",
          zen ? "max-w-3xl pt-14 sm:pt-20" : "max-w-6xl pt-6",
        )}
      >
        {/* Reading sheet — in zen the card chrome falls away, leaving just text */}
        <div
          className={cn(
            "relative rounded-xl p-6 transition-colors duration-300 sm:p-8 lg:p-12",
            zen ? "shadow-none" : "shadow-[var(--shadow-raised)]",
          )}
          style={zen ? { ...sheetStyle, border: "none" } : sheetStyle}
        >
          {!zen ? (
            <div className="absolute top-0 right-12 flex flex-col items-center" aria-hidden="true">
              <div className="flex h-12 w-6 items-center justify-center bg-ink-accent shadow-sm">
                <BookmarkPlus className="size-[14px] text-white" />
              </div>
              <div className="size-0 border-x-[12px] border-t-[8px] border-x-transparent border-t-ink-accent" />
            </div>
          ) : null}

          <div
            className={cn(
              "grid grid-cols-1 items-start gap-8",
              !zen && "lg:grid-cols-12 lg:gap-10",
            )}
          >
            <article
              className={cn("min-w-0 max-w-[680px]", zen ? "mx-auto w-full" : "lg:col-span-8")}
            >
              <header className="space-y-4 pb-6">
                {!zen ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <WashiTag tone="paper">
                      {article.source === "x" ? "X" : article.siteName || "Article"}
                    </WashiTag>
                    <span className="text-xs text-current opacity-50" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-sans text-[11px] text-current opacity-60">
                      {article.readingMinutes} min read
                    </span>
                  </div>
                ) : null}
                <ViewTransition name={`article-title-${item.id}`} share="text-morph">
                  <h1
                    className="font-display text-[2.25rem] leading-[1.1] font-normal tracking-tight text-balance sm:text-[2.75rem]"
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
                  {article.canonicalUrl || article.url ? (
                    <a
                      href={article.canonicalUrl || article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-2 transition-colors hover:text-hanko"
                    >
                      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                      View original
                    </a>
                  ) : null}
                  {!zen ? (
                    <span className="inline-flex items-center gap-1.5 text-hanko">
                      <span
                        className="inline-block size-2 rounded-full bg-hanko"
                        aria-hidden="true"
                      />
                      {item.highlights.length} Inked Passage
                      {item.highlights.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
              </header>

              {!zen ? <OrganizeRow item={item} /> : null}

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
                onSelectEnd={handleSelectEnd}
                onClick={onBodyClick}
                onKeyDown={onBodyKeyDown}
                bodyRef={bodyRef}
              />

              {!zen ? (
                <>
                  <MarginaliaHighlights
                    item={item}
                    onNote={(highlightId, note) => setHighlightNote(item.id, highlightId, note)}
                    onRemove={removeHighlightWithUndo}
                    onExport={() => void exportToJournal()}
                  />

                  <footer className="mt-10">
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium opacity-60">
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
                </>
              ) : null}
            </article>

            {/* Marginalia gutter — fully removed in zen so only text remains */}
            {!zen ? (
              <aside
                className="flex min-w-0 flex-col gap-6 lg:col-span-4 lg:sticky lg:top-24 lg:-mx-1 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:overscroll-contain lg:px-1 lg:pb-6 lg:[scrollbar-width:thin]"
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

                <ReaderAi item={item} />

                {item.highlights.length === 0 && !item.note ? (
                  <p className="rounded-xl bg-ink/5 p-4 font-body text-sm italic opacity-70">
                    Select any passage to ink it — your thoughts will gather in this margin.
                  </p>
                ) : null}

                {item.highlights.map((h) => (
                  <div key={h.id} className="space-y-2 rounded-xl bg-ink/5 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1 font-sans text-[11px] font-semibold text-hanko">
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-hanko"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          On “{h.text.slice(0, 32)}
                          {h.text.length > 32 ? "…" : ""}”
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
                    className="mt-2 min-h-24 w-full rounded-md bg-transparent px-1 py-1.5 font-body text-sm outline-none placeholder:italic placeholder:opacity-50 focus-visible:ring-2 focus-visible:ring-hanko/40"
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
                      {percent}% ·{" "}
                      {percent > 60 ? "Deep State" : percent > 20 ? "Settling In" : "Opening"}
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
            ) : null}
          </div>
        </div>
      </div>

      <NarrationPlayer item={item} narration={narration} />
      <NarrationRefusalDialog narration={narration} />

      {zen ? (
        /* Zen: quiet on desktop, fully discoverable on touch screens. */
        <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 opacity-100 transition-opacity duration-300 md:opacity-40 md:hover:opacity-100 md:focus-within:opacity-100">
          <div className="flex items-center gap-2 rounded-full bg-surface/95 py-1.5 pr-2 pl-1.5 shadow-[var(--shadow-raised)] backdrop-blur-xl">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to library"
              title="Back to library"
              className="flex size-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-paper-warm hover:text-ink md:size-8"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </button>
            <span
              className="font-sans text-[11px] text-ink-muted tabular-nums"
              aria-label={`${percent}% read`}
            >
              {percent}%
            </span>
            <button
              type="button"
              onClick={() => setZen(false)}
              aria-label="Exit zen focus (Esc)"
              title="Exit zen (Esc)"
              className="flex min-h-11 items-center gap-1.5 rounded-full bg-hanko px-3 font-sans text-xs font-medium text-paper transition-colors hover:bg-shu md:min-h-8"
            >
              <EyeOff className="size-4" aria-hidden="true" />
              <span>Exit Zen</span>
            </button>
          </div>
          <p className="mt-1.5 text-center font-sans text-[10px] text-ink-muted opacity-0 transition-opacity duration-300 hover:opacity-100">
            Esc to exit
          </p>
        </div>
      ) : (
        /* Standard floating dock */
        <div className="g-bar-in fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 items-center justify-between gap-2 rounded-2xl bg-surface/95 px-2 py-2 shadow-[var(--shadow-raised)] backdrop-blur-xl sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:w-[90%] sm:gap-6 sm:rounded-full sm:px-6 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to library"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-paper-warm text-ink-soft transition-colors hover:text-hanko sm:size-8"
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
                "flex size-11 items-center justify-center rounded-full font-sans text-xs transition-colors sm:size-auto sm:min-h-8 sm:gap-1.5 sm:px-3 sm:py-1.5",
                zen ? "bg-hanko text-paper" : "bg-paper-warm text-ink-soft hover:text-ink",
              )}
            >
              <Eye className="size-[18px]" aria-hidden="true" />
              <span className="hidden sm:inline">Zen Focus</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
