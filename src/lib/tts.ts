export type TtsStatus = "idle" | "loading" | "playing" | "paused";

export type TtsWord = {
  word: string;
  start: number;
  end: number;
};

export type TtsVoice = { id: string; label: string };

export const TTS_VOICES: TtsVoice[] = [
  { id: "af_heart", label: "Heart (US, F)" },
  { id: "af_bella", label: "Bella (US, F)" },
  { id: "af_nicole", label: "Nicole (US, F)" },
  { id: "am_michael", label: "Michael (US, M)" },
  { id: "am_fenrir", label: "Fenrir (US, M)" },
  { id: "bf_emma", label: "Emma (UK, F)" },
  { id: "bm_george", label: "George (UK, M)" },
];

export const DEFAULT_VOICE = TTS_VOICES[0]!.id;

export function resolveVoice(id: string): string {
  return TTS_VOICES.some((v) => v.id === id) ? id : DEFAULT_VOICE;
}

export type SpeakOptions = {
  rate: number;
  voiceId: string;
  onStatus: (status: TtsStatus) => void;
  /** Called with the sentence being read (offsets into the source text). */
  onWord?: (word: TtsWord) => void;
  onProgress?: (percent: number) => void;
  onError?: (message: string) => void;
};

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined" && "AudioContext" in window;
}

let worker: Worker | null = null;

function getWorker(): Worker {
  worker ??= new Worker(new URL("./kokoro.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

/** Start downloading/initialising the model ahead of the first Listen. */
export function warmTts() {
  if (ttsAvailable()) getWorker().postMessage({ type: "load" });
}

type Chunk = { text: string; start: number; end: number };

function chunkText(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  const re = /[^.!?\n]+(?:[.!?]+["')\]]*|\n|$)/g;
  let cur: Chunk | null = null;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const piece = raw.trim();
    if (!piece) continue;
    const start = m.index + lead;
    const end = start + piece.length;
    if (cur && end - cur.start <= 280) {
      cur.text = text.slice(cur.start, end);
      cur.end = end;
    } else {
      if (cur) chunks.push(cur);
      cur = { text: piece, start, end };
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export function speakArticle(text: string, options: SpeakOptions) {
  const w = getWorker();
  const chunks = chunkText(text).slice(0, 500);
  const ctx = new AudioContext();
  let rate = options.rate;
  let voiceId = resolveVoice(options.voiceId);
  let stopped = false;
  let paused = false;
  let playing: AudioBufferSourceNode | null = null;
  let nextPlay = 0;
  let nextRequest = 0;
  const ready = new Map<number, AudioBuffer>();
  const inflight = new Set<number>();
  const AHEAD = 2;

  const finish = () => {
    if (stopped) return;
    stopped = true;
    w.removeEventListener("message", onMessage);
    void ctx.close();
    options.onWord?.({ word: "", start: 0, end: 0 });
    options.onStatus("idle");
  };

  const pump = () => {
    while (!stopped && nextRequest < chunks.length && nextRequest < nextPlay + AHEAD + 1) {
      const id = nextRequest++;
      inflight.add(id);
      w.postMessage({ type: "generate", id, text: chunks[id]!.text, voice: voiceId, speed: rate });
    }
  };

  const playNext = () => {
    if (stopped || playing) return;
    if (nextPlay >= chunks.length) return finish();
    const buffer = ready.get(nextPlay);
    if (!buffer) {
      if (!paused) options.onStatus("loading");
      return;
    }
    ready.delete(nextPlay);
    const chunk = chunks[nextPlay]!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      playing = null;
      nextPlay += 1;
      pump();
      playNext();
    };
    playing = src;
    if (!paused) options.onStatus("playing");
    options.onWord?.({ word: "Listening", start: chunk.start, end: chunk.end });
    src.start();
    pump();
  };

  function onMessage(event: MessageEvent) {
    const msg = event.data as
      | { type: "progress"; progress: number }
      | { type: "audio"; id: number; samples: Float32Array; rate: number }
      | { type: "error"; id: number; message: string }
      | { type: "ready" };
    if (msg.type === "progress") {
      options.onProgress?.(msg.progress);
    } else if (msg.type === "audio") {
      if (!inflight.delete(msg.id) || stopped) return;
      const buffer = ctx.createBuffer(1, msg.samples.length, msg.rate);
      buffer.copyToChannel(msg.samples as Float32Array<ArrayBuffer>, 0);
      ready.set(msg.id, buffer);
      playNext();
    } else if (msg.type === "error") {
      options.onError?.(msg.message);
      finish();
    }
  }

  w.addEventListener("message", onMessage);
  options.onStatus("loading");
  if (chunks.length === 0) finish();
  else pump();

  return {
    stop: finish,
    pause: () => {
      paused = true;
      void ctx.suspend();
      options.onStatus("paused");
    },
    resume: () => {
      paused = false;
      void ctx.resume();
      options.onStatus(playing ? "playing" : "loading");
    },
    setOptions: (next: { rate?: number; voiceId?: string }) => {
      if (typeof next.rate === "number") rate = next.rate;
      if (typeof next.voiceId === "string") voiceId = resolveVoice(next.voiceId);
    },
  };
}
