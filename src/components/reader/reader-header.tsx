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
import type { TtsStatus } from "@/lib/tts.ts";
import { voiceLabel } from "@/lib/tts.ts";
import { RATES } from "@/hooks/use-reader-tts.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

type ReaderHeaderProps = {
  favorited: boolean;
  archived: boolean;
  canSpeak: boolean;
  tts: TtsStatus;
  listenOpen: boolean;
  word: string;
  voices: SpeechSynthesisVoice[];
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
      className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur-sm"
      style={{ viewTransitionName: "reader-header" }}
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-1 px-2 py-2 sm:px-6">
        <Button variant="ghost" className="gap-2 px-3" onClick={onBack}>
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Library</span>
        </Button>
        <div className="ml-auto flex items-center gap-1">
          {canSpeak ? (
            <>
              <Button
                variant="ghost"
                className="gap-2 px-3"
                onClick={onToggleListen}
                aria-label={tts === "playing" ? "Pause reading" : "Listen"}
              >
                {tts === "playing" ? <Pause className="size-4" /> : <Play className="size-4" />}
                <span className="hidden sm:inline">
                  {tts === "playing" ? "Pause" : tts === "paused" ? "Resume" : "Listen"}
                </span>
              </Button>
              {tts !== "idle" || listenOpen ? (
                <Button variant="ghost" size="icon" aria-label="Stop reading" onClick={onStopTts}>
                  <Square className="size-3.5" />
                </Button>
              ) : null}
            </>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            aria-label={favorited ? "Remove favorite" : "Favorite"}
            onClick={onToggleFavorite}
          >
            <Star className={cn("size-4", favorited && "fill-ink text-ink")} />
          </Button>
          <div className="relative" ref={prefsRef}>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Reading preferences"
              aria-expanded={prefsOpen}
              onClick={onTogglePrefs}
            >
              <Type className="size-4" />
            </Button>
            {prefsOpen ? prefsPanel : null}
          </div>
          <Button variant="ghost" className="gap-2 px-3" onClick={onArchive}>
            {archived ? <Inbox className="size-4" /> : <Archive className="size-4" />}
            <span className="hidden sm:inline">{archived ? "Inbox" : "Archive"}</span>
          </Button>
        </div>
      </div>
      {tts !== "idle" || listenOpen ? (
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 px-4 pb-3 sm:px-6">
          <p className="min-w-0 flex-1 font-display text-2xl leading-tight tracking-tight text-ink">
            {word || (tts === "paused" ? "Paused" : "Listening")}
          </p>
          <label className="sr-only" htmlFor="tts-voice">
            Voice
          </label>
          <select
            id="tts-voice"
            className="h-11 max-w-40 rounded-md bg-surface px-2 text-sm text-ink shadow-border"
            value={ttsVoiceURI}
            onChange={(e) => onTtsVoice(e.target.value)}
          >
            <option value="">Default voice</option>
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voiceLabel(voice)}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="tts-rate">
            Speed
          </label>
          <select
            id="tts-rate"
            className="h-11 rounded-md bg-surface px-2 text-sm text-ink shadow-border"
            value={String(ttsRate)}
            onChange={(e) => onTtsRate(Number(e.target.value))}
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
  );
}
