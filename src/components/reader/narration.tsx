import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { ACTIVE_NARRATION, type NarrationHandle } from "@/hooks/use-narration.ts";
import { narrationApi, type NarrationView } from "@/lib/api/narration";
import type { Refusal } from "@/lib/narration-engine";
import { useLibraryStore, type LibraryItem } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Narration in the reader: a toolbar control to create audio (and follow
 * its progress), and a player bar that appears only once the audio exists.
 * Audio is never made without the reader asking, and plays straight from
 * private storage through a short-lived URL that is renewed when it expires.
 */

const SPEEDS = [0.8, 1, 1.25, 1.5, 2] as const;
const SPEED_KEY = "kami.narration.speed";
const SAVE_EVERY_MS = 10_000;

function progressLabel(view: NarrationView): string {
  if (view.state === "tidying") return "Cleaning up…";
  if (view.state === "joining") return "Finishing…";
  if (view.state === "queued" || view.partsDone === 0) return "Narrating…";
  return `Narrating part ${Math.min(view.partsDone + 1, view.partsTotal)} of ${view.partsTotal}…`;
}

/** The reader-toolbar control: Create audio → progress → Resume, or show/hide the player. */
export function NarrationButton({ narration }: { narration: NarrationHandle }) {
  const { enabled, view, start, playerOpen, setPlayerOpen } = narration;
  if (!enabled) return null;

  if (view && ACTIVE_NARRATION.has(view.state)) {
    return (
      <span
        role="status"
        className="flex min-h-11 items-center gap-2 px-3 font-sans text-xs text-ink-muted"
      >
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        <span className="hidden sm:inline">{progressLabel(view)}</span>
      </span>
    );
  }

  if (view?.state === "paused") {
    return (
      <Button
        variant="ghost"
        className="gap-2 px-3"
        disabled={start.isPending}
        onClick={() => start.mutate()}
        title={view.pausedReason ?? "Audio paused"}
      >
        <AlertCircle className="size-4 text-hanko" aria-hidden="true" />
        <span className="hidden sm:inline">Resume audio</span>
        <span className="sr-only sm:hidden">Resume audio</span>
      </Button>
    );
  }

  if (view?.state === "ready") {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label={playerOpen ? "Hide audio player" : "Show audio player"}
        aria-pressed={playerOpen}
        onClick={() => setPlayerOpen(!playerOpen)}
      >
        <Headphones className={cn("size-4", playerOpen && "text-hanko")} aria-hidden="true" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      className="gap-2 px-3"
      disabled={start.isPending}
      onClick={() => start.mutate()}
      title="Narrate this article aloud"
    >
      {start.isPending ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Headphones className="size-4" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">Create audio</span>
      <span className="sr-only sm:hidden">Create audio</span>
    </Button>
  );
}

const words = (chars: number) => Math.round(chars / 6 / 100) * 100;

function refusalCopy(refusal: Refusal): { title: string; body: string } {
  switch (refusal.code) {
    case "unsupported_language":
      return {
        title: "Not available for this language yet",
        body: "Audio is only available for articles in English for now.",
      };
    case "too_long":
      return {
        title: "Too long to narrate",
        body: `This piece is about ${words(refusal.chars).toLocaleString()} words; audio is limited to about ${words(refusal.limit).toLocaleString()}.`,
      };
    case "no_allowance":
      return {
        title: "Not enough narration allowance",
        body:
          refusal.available > 0
            ? `This article needs ${refusal.needed.toLocaleString()} characters and you have ${refusal.available.toLocaleString()} left.`
            : "You don't have narration allowance yet. Ask whoever runs this Kami to add some.",
      };
    case "stub":
      return {
        title: "No text to narrate yet",
        body: "This was saved as a link. Open it so Kami can fetch a clean copy, then try again.",
      };
  }
}

/** Why Create audio didn't start. Nothing was spent. */
export function NarrationRefusalDialog({ narration }: { narration: NarrationHandle }) {
  const { refusal, clearRefusal } = narration;
  const copy = refusal ? refusalCopy(refusal) : null;
  return (
    <Dialog open={Boolean(refusal)} onOpenChange={(open) => !open && clearRefusal()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={clearRefusal}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function readSpeed(): number {
  try {
    const saved = Number(localStorage.getItem(SPEED_KEY));
    return (SPEEDS as readonly number[]).includes(saved) ? saved : 1;
  } catch {
    return 1;
  }
}

/** The player bar, shown only for finished audio. */
export function NarrationPlayer({
  item,
  narration,
}: {
  item: LibraryItem;
  narration: NarrationHandle;
}) {
  const { view, playerOpen, setPlayerOpen } = narration;
  if (!view || view.state !== "ready" || !playerOpen) return null;
  return (
    <PlayerBar
      key={`${item.id}:${view.createdAt}`}
      item={item}
      view={view}
      narration={narration}
      onClose={() => setPlayerOpen(false)}
    />
  );
}

function PlayerBar({
  item,
  view,
  narration,
  onClose,
}: {
  item: LibraryItem;
  view: NarrationView;
  narration: NarrationHandle;
  onClose: () => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const restoreAt = useRef(view.positionSeconds);
  const renewing = useRef(false);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(view.positionSeconds);
  const [duration, setDuration] = useState(view.durationSeconds ?? 0);
  const [speed, setSpeed] = useState(readSpeed);
  const setProgress = useLibraryStore((s) => s.setProgress);
  const articleId = item.id;

  const loadUrl = useCallback(async () => {
    const { url } = await narrationApi.audio(articleId);
    setSrc(url);
  }, [articleId]);

  useEffect(() => {
    loadUrl().catch(() => toast.error("Could not load the audio."));
  }, [loadUrl]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
    try {
      localStorage.setItem(SPEED_KEY, String(speed));
    } catch {
      /* per-device convenience only */
    }
  }, [speed, src]);

  const savePosition = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    void narrationApi.savePosition(articleId, el.currentTime).catch(() => {});
  }, [articleId]);

  // Save the listening position every few seconds while playing.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(savePosition, SAVE_EVERY_MS);
    return () => clearInterval(timer);
  }, [playing, savePosition]);

  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }, []);

  const skip = useCallback((delta: number) => {
    const el = audio.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || Infinity, el.currentTime + delta));
  }, []);

  // Lock screen and headphone controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    try {
      session.metadata = new MediaMetadata({
        title: item.title,
        artist: item.author || item.siteName,
        album: item.siteName || "Kami",
        artwork: item.heroImage ? [{ src: item.heroImage }] : [],
      });
      session.setActionHandler("play", () => void audio.current?.play());
      session.setActionHandler("pause", () => audio.current?.pause());
      session.setActionHandler("seekbackward", () => skip(-15));
      session.setActionHandler("seekforward", () => skip(30));
      session.setActionHandler("seekto", (d) => {
        if (audio.current && d.seekTime != null) audio.current.currentTime = d.seekTime;
      });
    } catch {
      /* not every browser supports every action */
    }
    return () => {
      session.metadata = null;
      for (const action of ["play", "pause", "seekbackward", "seekforward", "seekto"] as const) {
        try {
          session.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
    };
  }, [item.title, item.author, item.siteName, item.heroImage, skip]);

  // Leaving the article stops playback and keeps the place.
  useEffect(() => {
    const el = audio.current;
    return () => {
      if (el && !el.paused) {
        el.pause();
        void narrationApi.savePosition(articleId, el.currentTime).catch(() => {});
      }
    };
  }, [articleId]);

  /** The presigned URL expired (or the network blipped): get a fresh one and carry on. */
  const onError = async () => {
    const el = audio.current;
    if (!el || renewing.current) return;
    renewing.current = true;
    restoreAt.current = el.currentTime || restoreAt.current;
    const wasPlaying = playing;
    try {
      await loadUrl();
      if (wasPlaying) requestAnimationFrame(() => void audio.current?.play().catch(() => {}));
    } catch {
      toast.error("The audio stopped loading. Try again in a moment.");
    } finally {
      renewing.current = false;
    }
  };

  const confirmDelete = () => {
    if (window.confirm("Delete this audio? You'd need to create it again to listen.")) {
      narration.remove.mutate();
    }
  };

  return (
    <div
      className="g-bar-in fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.5rem)] left-1/2 z-40 w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 rounded-2xl bg-surface/95 px-3 py-2 shadow-[var(--shadow-raised)] backdrop-blur-xl sm:bottom-[calc(max(1.5rem,env(safe-area-inset-bottom))+4.5rem)] sm:w-[90%] sm:px-5"
      role="region"
      aria-label="Audio player"
    >
      {src ? (
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            el.playbackRate = speed;
            if (Number.isFinite(el.duration)) setDuration(el.duration);
            const at = restoreAt.current;
            if (at > 0 && at < (el.duration || Infinity) - 5) el.currentTime = at;
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            savePosition();
          }}
          onEnded={() => {
            setPlaying(false);
            setProgress(articleId, 1);
            savePosition();
          }}
          onError={() => void onError()}
        />
      ) : null}
      {view.stale ? (
        <p className="mb-1 font-sans text-[11px] text-hanko">
          The text changed since this audio was made.{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => narration.start.mutate()}
            disabled={narration.start.isPending}
          >
            Re-create audio
          </button>
        </p>
      ) : null}
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={() => skip(-15)}
          aria-label="Back 15 seconds"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-paper-warm hover:text-ink"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={toggle}
          disabled={!src}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-hanko text-paper transition-colors hover:bg-shu disabled:opacity-50"
        >
          {playing ? (
            <Pause className="size-5" aria-hidden="true" />
          ) : (
            <Play className="size-5 translate-x-px" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => skip(30)}
          aria-label="Forward 30 seconds"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-paper-warm hover:text-ink"
        >
          <RotateCw className="size-4" aria-hidden="true" />
        </button>
        <span className="hidden w-12 shrink-0 text-right font-sans text-[11px] text-ink-muted tabular-nums sm:inline">
          {clock(time)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={1}
          value={Math.min(time, duration || time)}
          onChange={(e) => {
            const el = audio.current;
            if (el) el.currentTime = Number(e.target.value);
            setTime(Number(e.target.value));
          }}
          aria-label="Seek"
          aria-valuetext={`${clock(time)} of ${clock(duration)}`}
          className="min-w-0 flex-1 accent-[#a6331b]"
        />
        <span className="w-12 shrink-0 font-sans text-[11px] text-ink-muted tabular-nums">
          {clock(duration)}
        </span>
        <button
          type="button"
          onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed as never) + 1) % SPEEDS.length])}
          aria-label={`Playback speed ${speed}×`}
          className="min-h-10 shrink-0 rounded-full px-2 font-sans text-xs font-medium text-ink-soft tabular-nums hover:bg-paper-warm hover:text-ink"
        >
          {speed}×
        </button>
        <button
          type="button"
          onClick={confirmDelete}
          disabled={narration.remove.isPending}
          aria-label="Delete audio"
          title="Delete audio"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-paper-warm hover:text-danger"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide audio player"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-paper-warm hover:text-ink"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
