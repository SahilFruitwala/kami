import { useEffect, useMemo, useRef, useState, type MouseEvent, ViewTransition } from "react";
import { ExternalLink } from "lucide-react";
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
import { HighlightsSection } from "@/components/reader/highlights-section.tsx";
import { ReaderBody } from "@/components/reader/reader-body.tsx";
import { ReaderHeader } from "@/components/reader/reader-header.tsx";
import { ReaderPrefsPanel } from "@/components/reader/reader-prefs.tsx";
import { useReaderProgress, useSelectionMenu } from "@/hooks/use-reader-selection.ts";
import { useReaderTts } from "@/hooks/use-reader-tts.ts";

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
  const [prefsOpen, setPrefsOpen] = useState(false);
  const hasLeadImage = /<img\b/i.test(article.contentHtml.slice(0, 1200));

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
  const fontFamily = READER_FONTS.find((f) => f.id === readerFont)?.family;

  const html = useMemo(
    () => applyHighlights(rewriteHtmlImages(article.contentHtml), item.highlights),
    [article.contentHtml, item.highlights],
  );

  const progress = useReaderProgress(article.canonicalUrl);
  const { menu, onSelectEnd, clearMenu } = useSelectionMenu(article.canonicalUrl, bodyRef);
  const tts = useReaderTts(article.canonicalUrl, bodyRef);

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
  }

  function saveHighlight(color?: HighlightColorId) {
    if (!menu) return;
    addHighlight(item.id, menu.text, color ?? highlightColor);
    window.getSelection()?.removeAllRanges();
    clearMenu();
  }

  return (
    <div className="relative">
      {/* Reading progress bar */}
      <div
        role="progressbar"
        aria-label="Reading progress"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="fixed inset-x-0 top-0 z-30 h-0.5 bg-line"
      >
        <div
          className="h-full bg-ink transition-[width] duration-150"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

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
            onBumpSize={bumpReaderFontSize}
            onFont={setReaderFont}
            onHighlightColor={setHighlightColor}
          />
        }
      />

      {menu ? (
        <HighlightMenu menu={menu} activeColor={highlightColor} onSave={saveHighlight} />
      ) : null}

      <article className="mx-auto w-full max-w-2xl px-4 pb-24 pt-10 sm:px-6">
        {/* Article header: source, author, reading time */}
        <header>
          <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            {[article.source === "x" ? "X" : article.siteName, article.author]
              .filter(Boolean)
              .join(" · ")}
            {` · ${article.readingMinutes} min read`}
          </p>
          <ViewTransition name={`article-title-${item.id}`} share="text-morph">
            <h1
              className="mt-3 text-3xl leading-tight tracking-tight sm:text-4xl"
              style={{ fontFamily }}
            >
              {article.title}
            </h1>
          </ViewTransition>
        </header>

        {/* Article organization: folders, tags */}
        <OrganizeRow item={item} />

        {/* Notes */}
        <aside aria-label="Article notes" className="mt-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Notes</span>
            <textarea
              className="mt-1.5 min-h-24 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-ink/20"
              placeholder="Private notes for this article…"
              value={item.note || ""}
              onChange={(e) => setItemNote(item.id, e.target.value)}
            />
          </label>
        </aside>

        {article.heroImage && !hasLeadImage ? (
          <ViewTransition name={`article-image-${item.id}`} share="morph">
            <img
              src={previewImageSrc(article.heroImage)}
              alt=""
              className="mt-8 w-full rounded-lg object-cover shadow-border"
            />
          </ViewTransition>
        ) : null}

        <ReaderBody
          html={html}
          fontSizeRem={fontSizeRem}
          fontId={readerFont}
          onSelectEnd={onSelectEnd}
          onClick={onBodyClick}
          bodyRef={bodyRef}
        />

        <HighlightsSection
          highlights={item.highlights}
          onNote={(highlightId, note) => setHighlightNote(item.id, highlightId, note)}
          onRemove={(highlightId) => removeHighlight(item.id, highlightId)}
        />

        {/* Article footer: source link */}
        <footer className="mt-10">
          <p className="flex items-center gap-2 text-sm font-medium text-ink-muted">
            <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
            <a
              href={article.canonicalUrl || article.url}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-faint underline-offset-2 hover:text-ink transition-colors"
            >
              View original article
            </a>
          </p>
        </footer>
      </article>
    </div>
  );
}
