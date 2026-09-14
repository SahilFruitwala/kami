import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type RefObject } from "react";
import {
  Archive,
  ArrowLeft,
  ExternalLink,
  Highlighter,
  Inbox,
  Minus,
  Pause,
  Play,
  Plus,
  Square,
  Star,
  Type,
} from "lucide-react";
import type { Article } from "@/lib/article-types.ts";
import { applyHighlights } from "@/lib/highlight-html.ts";
import { rewriteHtmlImages, previewImageSrc } from "@/lib/image-url.ts";
import { listVoices, speakArticle, ttsAvailable, voiceLabel, type TtsStatus, type TtsWord } from "@/lib/tts.ts";
import { clearSpokenWord, collectSpokenText, paintSpokenWord } from "@/lib/spoken-range.ts";
import {
  HIGHLIGHT_COLORS,
  READER_FONTS,
  READER_FONT_SIZES,
  useLibraryStore,
  type LibraryItem,
} from "@/lib/store.ts";
import { OrganizeRow } from "@/components/organize-row.tsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";

const RATES = [
  { value: 0.75, label: "0.75×" },
  { value: 1, label: "1×" },
  { value: 1.25, label: "1.25×" },
  { value: 1.5, label: "1.5×" },
] as const;

const ReaderBody = memo(function ReaderBody({
  html,
  fontSizeRem,
  fontId,
  onSelectEnd,
  onClick,
  bodyRef,
}: {
  html: string;
  fontSizeRem: number;
  fontId: string;
  onSelectEnd: () => void;
  onClick: (event: MouseEvent<HTMLDivElement>) => void;
  bodyRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={bodyRef}
      className="reader-body mt-8"
      data-font={fontId}
      style={{ "--reader-font-size": `${fontSizeRem}rem` } as CSSProperties}
      onMouseUp={onSelectEnd}
      onTouchEnd={onSelectEnd}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

type SelMenu = {
  text: string;
  x: number;
  y: number;
  rects: { top: number; left: number; width: number; height: number }[];
};

function selectionMenu(): SelMenu | null {
  const sel = window.getSelection();
  const text = sel?.toString().replace(/\s+/g, " ").trim() || "";
  if (!sel || !sel.rangeCount || text.length < 8) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const rects = [...range.getClientRects()].map((r) => ({
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  }));
  const above = rect.top - 48;
  const y = above < 64 ? rect.bottom + 8 : above;
  return {
    text,
    x: Math.min(window.innerWidth - 220, Math.max(12, rect.left + rect.width / 2 - 110)),
    y,
    rects,
  };
}

export function ReaderView({
  item,
  article,
  onBack,
  onArchive,
}: {
  item: LibraryItem;
  article: Article;
  onBack: () => void;
  onArchive: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const prefsRef = useRef<HTMLDivElement>(null);
  const ttsRef = useRef<{
    stop: () => void;
    pause: () => void;
    resume: () => void;
    setOptions: (next: { rate?: number; voiceURI?: string }) => void;
  } | null>(null);
  const [progress, setProgress] = useState(0);
  const [tts, setTts] = useState<TtsStatus>("idle");
  const [word, setWord] = useState("");
  const [menu, setMenu] = useState<SelMenu | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [listenOpen, setListenOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const canSpeak = ttsAvailable();
  const hasLeadImage = /<img\b/i.test(article.contentHtml.slice(0, 1200));

  const ttsRate = useLibraryStore((s) => s.ttsRate);
  const ttsVoiceURI = useLibraryStore((s) => s.ttsVoiceURI);
  const setTtsRate = useLibraryStore((s) => s.setTtsRate);
  const setTtsVoiceURI = useLibraryStore((s) => s.setTtsVoiceURI);
  const readerFontSize = useLibraryStore((s) => s.readerFontSize);
  const readerFont = useLibraryStore((s) => s.readerFont);
  const highlightColor = useLibraryStore((s) => s.highlightColor);
  const bumpReaderFontSize = useLibraryStore((s) => s.bumpReaderFontSize);
  const setReaderFont = useLibraryStore((s) => s.setReaderFont);
  const setHighlightColor = useLibraryStore((s) => s.setHighlightColor);
  const addHighlight = useLibraryStore((s) => s.addHighlight);
  const removeHighlight = useLibraryStore((s) => s.removeHighlight);
  const setHighlightNote = useLibraryStore((s) => s.setHighlightNote);
  const setFavorited = useLibraryStore((s) => s.setFavorited);
  const setItemNote = useLibraryStore((s) => s.setItemNote);

  const fontSizeRem = READER_FONT_SIZES[readerFontSize] ?? READER_FONT_SIZES[2];

  const html = useMemo(
    () => applyHighlights(rewriteHtmlImages(article.contentHtml), item.highlights),
    [article.contentHtml, item.highlights],
  );

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max <= 0 ? 0 : Math.min(1, el.scrollTop / max));
      setMenu((current) => (current ? selectionMenu() : null));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [article.canonicalUrl]);

  useEffect(() => {
    const load = () => setVoices(listVoices(ttsVoiceURI));
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", load);
  }, [ttsVoiceURI]);

  useEffect(() => {
    ttsRef.current?.setOptions({ rate: ttsRate, voiceURI: ttsVoiceURI });
  }, [ttsRate, ttsVoiceURI]);

  useEffect(() => {
    return () => {
      ttsRef.current?.stop();
      ttsRef.current = null;
      clearSpokenWord();
    };
  }, [article.canonicalUrl]);

  useEffect(() => {
    if (!prefsOpen) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (prefsRef.current?.contains(target)) return;
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

  function stopTts() {
    ttsRef.current?.stop();
    ttsRef.current = null;
    setTts("idle");
    setWord("");
    setListenOpen(false);
    clearSpokenWord();
  }

  function onSpokenWord(next: TtsWord) {
    setWord(next.word);
    paintSpokenWord(bodyRef.current, next.start, next.end);
  }

  function toggleListen() {
    if (!canSpeak) {
      toast.error("This browser cannot read aloud.");
      return;
    }
    if (tts === "playing") {
      ttsRef.current?.pause();
      return;
    }
    if (tts === "paused") {
      ttsRef.current?.resume();
      return;
    }
    try {
      const plain = collectSpokenText(bodyRef.current);
      if (!plain.trim()) {
        toast.error("Nothing to read in this article.");
        return;
      }
      setListenOpen(true);
      setWord("Listening");
      ttsRef.current = speakArticle(plain, {
        rate: ttsRate,
        voiceURI: ttsVoiceURI,
        onStatus: (status) => {
          setTts(status);
          if (status === "idle") setListenOpen(false);
        },
        onWord: onSpokenWord,
      });
    } catch {
      toast.error("Could not start reading aloud.");
    }
  }

  const onSelectEnd = useCallback(() => {
    const sel = window.getSelection();
    const next = selectionMenu();
    if (!next || !bodyRef.current?.contains(sel?.anchorNode ?? null)) {
      setMenu(null);
      return;
    }
    setMenu(next);
  }, []);

  const onBodyClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const selected = window.getSelection()?.toString().trim() || "";
    if (selected.length >= 8) return;
    const mark = (event.target as HTMLElement).closest("mark");
    if (mark?.getAttribute("data-hid")) {
      removeHighlight(item.id, mark.getAttribute("data-hid") || "");
      return;
    }
    const link = (event.target as HTMLElement).closest("a");
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute("href");
    if (href && /^https?:\/\//i.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }, [item.id, removeHighlight]);

  function saveHighlight(color = highlightColor) {
    if (!menu) return;
    addHighlight(item.id, menu.text, color);
    window.getSelection()?.removeAllRanges();
    setMenu(null);
  }

  return (
    <div className="relative">
      <div aria-hidden className="fixed inset-x-0 top-0 z-30 h-0.5 bg-line">
        <div
          className="h-full bg-ink transition-[width] duration-150"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-1 px-2 py-2 sm:px-6">
          <Button variant="ghost" className="gap-2 px-3" onClick={() => { stopTts(); onBack(); }}>
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Library</span>
          </Button>
          <div className="ml-auto flex items-center gap-1">
            {canSpeak ? (
              <>
                <Button
                  variant="ghost"
                  className="gap-2 px-3"
                  onClick={toggleListen}
                  aria-label={tts === "playing" ? "Pause reading" : "Listen"}
                >
                  {tts === "playing" ? <Pause className="size-4" /> : <Play className="size-4" />}
                  <span className="hidden sm:inline">
                    {tts === "playing" ? "Pause" : tts === "paused" ? "Resume" : "Listen"}
                  </span>
                </Button>
                {tts !== "idle" || listenOpen ? (
                  <Button variant="ghost" size="icon" aria-label="Stop reading" onClick={stopTts}>
                    <Square className="size-3.5" />
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label={item.favorited ? "Remove favorite" : "Favorite"}
              onClick={() => {
                setFavorited(item.id, !item.favorited);
                toast.success(item.favorited ? "Removed from favorites" : "Favorited");
              }}
            >
              <Star className={cn("size-4", item.favorited && "fill-ink text-ink")} />
            </Button>
            <div className="relative" ref={prefsRef}>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Reading preferences"
                aria-expanded={prefsOpen}
                onClick={() => setPrefsOpen((open) => !open)}
              >
                <Type className="size-4" />
              </Button>
              {prefsOpen ? (
                <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg bg-surface p-3 shadow-border">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Text size</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label="Decrease font size"
                      disabled={readerFontSize <= 0}
                      onClick={() => bumpReaderFontSize(-1)}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <div className="flex flex-1 items-center justify-center gap-1">
                      {READER_FONT_SIZES.map((_, i) => (
                        <span
                          key={i}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            i === readerFontSize ? "bg-ink" : "bg-line",
                          )}
                        />
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label="Increase font size"
                      disabled={readerFontSize >= READER_FONT_SIZES.length - 1}
                      onClick={() => bumpReaderFontSize(1)}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>

                  <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">Font</p>
                  <div className="mt-2 grid gap-1">
                    {READER_FONTS.map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        className={cn(
                          "rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          readerFont === font.id
                            ? "bg-paper-warm text-ink"
                            : "text-ink-soft hover:bg-paper-warm/60 hover:text-ink",
                        )}
                        style={{ fontFamily: font.family }}
                        onClick={() => setReaderFont(font.id)}
                      >
                        {font.label}
                      </button>
                    ))}
                  </div>

                  <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">
                    Default highlight
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {HIGHLIGHT_COLORS.map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        aria-label={color.label}
                        title={color.label}
                        className={cn(
                          "size-8 rounded-full border-2 transition-transform",
                          highlightColor === color.id
                            ? "scale-110 border-ink"
                            : "border-transparent hover:scale-105",
                        )}
                        style={{ background: color.swatch }}
                        onClick={() => setHighlightColor(color.id)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <Button variant="ghost" className="gap-2 px-3" onClick={onArchive}>
              {item.archived ? <Inbox className="size-4" /> : <Archive className="size-4" />}
              <span className="hidden sm:inline">{item.archived ? "Inbox" : "Archive"}</span>
            </Button>
          </div>
        </div>
        {tts !== "idle" || listenOpen ? (
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 px-4 pb-3 sm:px-6">
            <p className="min-w-0 flex-1 font-display text-2xl leading-tight tracking-tight text-ink">
              {word || (tts === "paused" ? "Paused" : "Listening")}
            </p>
            <label className="sr-only" htmlFor="tts-voice">Voice</label>
            <select
              id="tts-voice"
              className="h-11 max-w-40 rounded-md bg-surface px-2 text-sm text-ink shadow-border"
              value={ttsVoiceURI}
              onChange={(e) => setTtsVoiceURI(e.target.value)}
            >
              <option value="">Default voice</option>
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voiceLabel(voice)}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="tts-rate">Speed</label>
            <select
              id="tts-rate"
              className="h-11 rounded-md bg-surface px-2 text-sm text-ink shadow-border"
              value={String(ttsRate)}
              onChange={(e) => setTtsRate(Number(e.target.value))}
            >
              {RATES.map((rate) => (
                <option key={rate.value} value={rate.value}>
                  {rate.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </header>

      {menu ? (
        <>
          {menu.rects.map((rect, i) => (
            <div
              key={i}
              aria-hidden
              className="sel-ghost"
              style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            />
          ))}
          <div
            data-highlight-menu
            className="fixed z-40 rounded-lg bg-surface p-2 shadow-border"
            style={{ left: menu.x, top: menu.y }}
          >
            <div className="flex items-center gap-1.5">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  aria-label={`Highlight ${color.label}`}
                  title={color.label}
                  className={cn(
                    "size-8 rounded-full border-2 transition-transform hover:scale-110",
                    highlightColor === color.id ? "border-ink" : "border-transparent",
                  )}
                  style={{ background: color.swatch }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => saveHighlight(color.id)}
                />
              ))}
            </div>
            <Button
              size="sm"
              className="mt-2 w-full gap-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => saveHighlight()}
            >
              <Highlighter className="size-3.5" />
              Highlight
            </Button>
          </div>
        </>
      ) : null}

      <article className="mx-auto w-full max-w-2xl px-4 pb-24 pt-10 sm:px-6">
        <p className="text-xs font-medium tracking-wide text-muted">
          {[article.source === "x" ? "X" : article.siteName, article.author]
            .filter(Boolean)
            .join(" · ")}
          {` · ${article.readingMinutes} min`}
        </p>
        <h1
          className="mt-3 text-3xl leading-tight tracking-tight sm:text-4xl"
          style={{ fontFamily: READER_FONTS.find((f) => f.id === readerFont)?.family }}
        >
          {article.title}
        </h1>

        <OrganizeRow item={item} />
        <label className="mt-4 block">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Notes</span>
          <textarea
            className="mt-1.5 min-h-24 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
            placeholder="Private notes for this article…"
            value={item.note || ""}
            onChange={(e) => setItemNote(item.id, e.target.value)}
          />
        </label>

        {article.heroImage && !hasLeadImage ? (
          <img
            src={previewImageSrc(article.heroImage)}
            alt=""
            className="mt-8 w-full rounded-lg object-cover shadow-border"
          />
        ) : null}

        <ReaderBody
          html={html}
          fontSizeRem={fontSizeRem}
          fontId={readerFont}
          onSelectEnd={onSelectEnd}
          onClick={onBodyClick}
          bodyRef={bodyRef}
        />

        {item.highlights.length > 0 ? (
          <section className="mt-14 border-t border-line pt-8">
            <h2 className="font-display text-xl">Highlights</h2>
            <ul className="mt-4 space-y-4">
              {item.highlights.map((highlight) => {
                const swatch =
                  HIGHLIGHT_COLORS.find((c) => c.id === highlight.color)?.swatch ?? "#e8c97a";
                return (
                <li key={highlight.id} className="rounded-md bg-surface p-3 shadow-border">
                  <p
                    className="rounded-sm px-1.5 py-0.5 font-display text-base leading-normal italic text-ink-soft"
                    style={{ background: `color-mix(in oklab, ${swatch} 55%, transparent)` }}
                  >
                    {highlight.text}
                  </p>
                  <Input
                    value={highlight.note}
                    onChange={(e) => setHighlightNote(item.id, highlight.id, e.target.value)}
                    placeholder="Add a note"
                    className="mt-2"
                  />
                  <button
                    type="button"
                    className="mt-2 text-xs text-muted underline decoration-faint underline-offset-2"
                    onClick={() => removeHighlight(item.id, highlight.id)}
                  >
                    Remove
                  </button>
                </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <p className="mt-12 text-sm text-muted">Select a passage to highlight it.</p>
        )}

        <p className="mt-10 flex items-center gap-2 text-sm text-muted">
          <ExternalLink className="size-3.5" />
          <a
            href={article.canonicalUrl || article.url}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-faint underline-offset-2 hover:text-ink"
          >
            View original
          </a>
        </p>
      </article>
    </div>
  );
}
