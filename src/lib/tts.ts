export type TtsStatus = "idle" | "playing" | "paused";

export type TtsWord = {
  word: string;
  start: number;
  end: number;
};

export type SpeakOptions = {
  rate: number;
  voiceURI: string;
  onStatus: (status: TtsStatus) => void;
  onWord?: (word: TtsWord) => void;
};

export function ttsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

const SKIP_VOICE = /compact|novelty|whisper|zarvox|bad news|good news|bells|boing|bubbles|cellos|deranged|hysterical|organ|pipe organ|princess|ralph|trinoids|albert|bahh|superstar|grandma|grandpa|flo|wobble|cellos/i;

const PREFERRED_VOICE = /samantha|daniel|karen|moira|rishi|fiona|veena|tessa|aria|jenny|guy|andrew|emma|sonia|google us english|google uk english female|neural/i;

export function voiceLabel(voice: SpeechSynthesisVoice): string {
  let name = voice.name
    .replace(/^Google /i, "")
    .replace(/^Microsoft /i, "")
    .replace(/^Apple /i, "")
    .replace(/ Online \(Natural\)/i, "")
    .replace(/ \(Natural\)/i, "")
    .replace(/ - English \(.*\)$/i, "")
    .trim();
  const region = /en-GB/i.test(voice.lang)
    ? "UK"
    : /en-AU/i.test(voice.lang)
      ? "AU"
      : /en-IN/i.test(voice.lang)
        ? "IN"
        : /en-US/i.test(voice.lang)
          ? "US"
          : "";
  if (region && !name.includes(region) && name.length < 18) name = `${name} (${region})`;
  return name;
}

function scoreVoice(voice: SpeechSynthesisVoice): number {
  let score = 0;
  if (SKIP_VOICE.test(voice.name)) return -100;
  if (!/^en/i.test(voice.lang)) score -= 20;
  if (voice.localService) score += 6;
  if (/en-US/i.test(voice.lang)) score += 3;
  if (/en-GB/i.test(voice.lang)) score += 3;
  if (/en-AU|en-IN/i.test(voice.lang)) score += 2;
  if (PREFERRED_VOICE.test(voice.name)) score += 8;
  if (/neural|natural|premium|enhanced/i.test(voice.name)) score += 5;
  if (/google/i.test(voice.name) && /english/i.test(voice.name)) score += 4;
  if (/microsoft/i.test(voice.name) && /online|neural|aria|jenny/i.test(voice.name)) score += 4;
  if (/compact/i.test(voice.name)) score -= 8;
  return score;
}

export function listVoices(keepURI = ""): SpeechSynthesisVoice[] {
  if (!ttsAvailable()) return [];
  const all = window.speechSynthesis.getVoices();
  const ranked = all
    .filter((voice) => /^en/i.test(voice.lang) && scoreVoice(voice) > 0)
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));

  const picked: SpeechSynthesisVoice[] = [];
  const seenLang = new Set<string>();
  const seenName = new Set<string>();
  for (const voice of ranked) {
    if (picked.length >= 4) break;
    const lang = voice.lang.slice(0, 5).toLowerCase();
    const label = voiceLabel(voice).toLowerCase();
    if (seenName.has(label)) continue;
    if (seenLang.has(lang) && picked.length >= 2) continue;
    seenLang.add(lang);
    seenName.add(label);
    picked.push(voice);
  }
  if (picked.length === 0 && ranked[0]) picked.push(ranked[0]);
  if (keepURI && !picked.some((voice) => voice.voiceURI === keepURI)) {
    const extra = all.find((voice) => voice.voiceURI === keepURI);
    if (extra) picked.push(extra);
  }
  return picked;
}

export function pickVoice(preferredURI = ""): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (preferredURI) {
    const match = voices.find((v) => v.voiceURI === preferredURI || v.name === preferredURI);
    if (match) return match;
  }
  return (
    voices.find((v) => /en-US/i.test(v.lang) && v.localService) ||
    voices.find((v) => /^en/i.test(v.lang) && v.localService) ||
    voices.find((v) => /en-US/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0] ||
    null
  );
}

function chunkText(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    if ((buf + " " + piece).trim().length > 360) {
      if (buf) chunks.push(buf);
      buf = piece;
    } else {
      buf = buf ? `${buf} ${piece}` : piece;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export function speakArticle(
  text: string,
  options: SpeakOptions,
): {
  stop: () => void;
  pause: () => void;
  resume: () => void;
  setOptions: (next: { rate?: number; voiceURI?: string }) => void;
} {
  const synth = window.speechSynthesis;
  synth.cancel();
  void synth.getVoices();
  const chunks = chunkText(text).slice(0, 100);
  const offsets: number[] = [];
  let running = 0;
  for (const chunk of chunks) {
    offsets.push(running);
    running += chunk.length + 1;
  }

  let index = 0;
  let stopped = false;
  let rate = options.rate;
  let voiceURI = options.voiceURI;

  const speakNext = () => {
    if (stopped || index >= chunks.length) {
      if (!stopped) {
        options.onWord?.({ word: "", start: 0, end: 0 });
        options.onStatus("idle");
      }
      return;
    }
    const chunk = chunks[index] ?? "";
    const utter = new SpeechSynthesisUtterance(chunk);
    const voice = pickVoice(voiceURI);
    if (voice) utter.voice = voice;
    utter.rate = rate;
    utter.pitch = 1;
    utter.onboundary = (event) => {
      if (stopped) return;
      if (event.name && event.name !== "word") return;
      const startInChunk = event.charIndex || 0;
      const rawLen = "charLength" in event ? Number((event as SpeechSynthesisEvent).charLength) : 0;
      const guessed = chunk.slice(startInChunk).match(/^\S+/)?.[0].length ?? 1;
      const len = rawLen > 0 ? rawLen : guessed;
      const word = chunk.slice(startInChunk, startInChunk + len).trim();
      if (!word) return;
      const start = (offsets[index] ?? 0) + startInChunk;
      options.onWord?.({ word, start, end: start + len });
    };
    utter.onend = () => {
      index += 1;
      speakNext();
    };
    utter.onerror = (event) => {
      const err = "error" in event ? String((event as SpeechSynthesisErrorEvent).error) : "";
      if (err === "interrupted" || err === "canceled") return;
      if (err === "not-allowed" || err === "synthesis-failed" || err === "synthesis-unavailable") {
        stopped = true;
        options.onWord?.({ word: "", start: 0, end: 0 });
        options.onStatus("idle");
        return;
      }
      index += 1;
      speakNext();
    };
    options.onStatus("playing");
    synth.speak(utter);
  };

  speakNext();

  return {
    stop: () => {
      stopped = true;
      synth.cancel();
      options.onWord?.({ word: "", start: 0, end: 0 });
      options.onStatus("idle");
    },
    pause: () => {
      synth.pause();
      options.onStatus("paused");
    },
    resume: () => {
      synth.resume();
      options.onStatus("playing");
    },
    setOptions: (next) => {
      if (typeof next.rate === "number") rate = next.rate;
      if (typeof next.voiceURI === "string") voiceURI = next.voiceURI;
    },
  };
}
