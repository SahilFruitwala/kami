import {
  Archive,
  ArrowLeft,
  Inbox,
  Pause,
  Play,
  Square,
  Star,
  Type,
} from "lucide-react";
import { resolveVoice, type TtsStatus, type TtsVoice } from "@/lib/tts.ts";
import { RATES } from "@/hooks/use-reader-tts.ts";
import { KAMI_GLYPH } from "@/components/kami.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { cn } from "@/lib/utils.ts";

type ReaderHeaderProps = {
  favorited: boolean;
  archived: boolean;
  canSpeak: boolean;
  tts: TtsStatus;
  listenOpen: boolean;
  word: string;
  voices: TtsVoice[];
  ttsRate: number;
  ttsVoiceURI: string;
  prefsOpen: boolean;
  prefsRef: React.RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onToggleListen: () => void;
  onStopTts: () => void;
  onToggleFavorite: () => void;
  onTogglePrefs: () => void;
  onArchive: () => void;
  onTtsRate: (rate: number) => void;
  onTtsVoice: (uri: string) => void;
  prefsPanel: React.ReactNode;
};

export function ReaderHeader({
  favorited,
  archived,
  canSpeak,
  tts,
  listenOpen,
  word,
  voices,
  ttsRate,
  ttsVoiceURI,
  prefsOpen,
  prefsRef,
  onBack,
  onToggleListen,
  onStopTts,
  onToggleFavorite,
  onTogglePrefs,
  onArchive,
  onTtsRate,
  onTtsVoice,
  prefsPanel,
}: ReaderHeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-line bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl"
      style={{ viewTransitionName: "reader-header" }}
    >
      <nav
        aria-label="Reader navigation and tools"
        className="mx-auto flex w-full max-w-6xl items-center gap-0.5 px-1 py-2 sm:gap-1 sm:px-6"
      >
        <Button variant="ghost" className="gap-2 px-3 font-medium text-ink" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Library</span>
        </Button>
        <span className="ml-1 hidden items-center gap-2 font-display text-sm text-ink-soft md:flex" aria-hidden="true">
          <span
            className="kami-hanko flex size-5 items-center justify-center rounded-[0.25rem] text-[10px] font-bold leading-none"
            lang="ja"
          >
            {KAMI_GLYPH}
          </span>
          Reader
        </span>
        <div className="ml-auto flex items-center gap-1" role="toolbar" aria-label="Reading controls">
          {canSpeak ? (
            <>
              <Button
                variant="ghost"
                className="gap-2 px-3"
                onClick={onToggleListen}
                aria-label={tts === "playing" ? "Pause reading" : "Listen"}
              >
                {tts === "playing" ? (
                  <Pause className="size-4" aria-hidden="true" />
                ) : (
                  <Play className="size-4" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">
                  {tts === "playing" ? "Pause" : tts === "paused" ? "Resume" : "Listen"}
                </span>
              </Button>
              {tts !== "idle" || listenOpen ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Stop reading"
                  onClick={onStopTts}
                >
                  <Square className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label={favorited ? "Remove favorite" : "Add to favorites"}
            aria-pressed={favorited}
            onClick={onToggleFavorite}
          >
            <Star className={cn("size-4", favorited && "fill-hanko text-hanko")} aria-hidden="true" />
          </Button>
          <ThemeToggle className="size-11" />
          <div className="relative" ref={prefsRef}>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reading preferences"
              aria-expanded={prefsOpen}
              aria-haspopup="dialog"
              onClick={onTogglePrefs}
            >
              <Type className="size-4" aria-hidden="true" />
            </Button>
            {prefsOpen ? prefsPanel : null}
          </div>
          <Button variant="ghost" className="gap-2 px-3" onClick={onArchive}>
            {archived ? (
              <Inbox className="size-4" aria-hidden="true" />
            ) : (
              <Archive className="size-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{archived ? "Inbox" : "Archive"}</span>
          </Button>
        </div>
      </nav>
      {tts !== "idle" || listenOpen ? (
        <section
          aria-label="Audio reader controls"
          className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-3 px-4 pb-3 sm:px-6"
        >
          <p className="min-w-0 flex-1 font-display text-2xl leading-tight tracking-tight text-ink" aria-live="polite">
            {word || (tts === "paused" ? "Paused" : "Listening")}
          </p>
          <label className="sr-only" htmlFor="tts-voice">
            Voice
          </label>
          <select
            id="tts-voice"
            className="h-10 max-w-40 rounded-lg bg-surface px-2 text-sm font-medium text-ink shadow-[var(--shadow-border)]"
            value={resolveVoice(ttsVoiceURI)}
            onChange={(e) => onTtsVoice(e.target.value)}
          >
                        {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="tts-rate">
            Speed
          </label>
          <select
            id="tts-rate"
            className="h-10 rounded-lg bg-surface px-2 text-sm font-medium text-ink shadow-[var(--shadow-border)]"
            value={String(ttsRate)}
            onChange={(e) => onTtsRate(Number(e.target.value))}
          >
            {RATES.map((rate) => (
              <option key={rate.value} value={rate.value}>
                {rate.label}
              </option>
            ))}
          </select>
        </section>
      ) : null}
    </header>
  );
}
