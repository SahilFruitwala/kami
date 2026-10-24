import { z } from "zod";

/**
 * The voices a reader can narrate with (Deepgram Aura-2). The id is the
 * Deepgram model, stored on each narration so a resume keeps its voice.
 * Shared by the settings card, the start request and the server.
 */
export const NARRATION_VOICES = [
  { id: "aura-2-thalia-en", name: "Thalia", accent: "American", note: "Clear, warm" },
  { id: "aura-2-draco-en", name: "Draco", accent: "British", note: "Warm, trustworthy" },
] as const;

export type NarrationVoiceId = (typeof NARRATION_VOICES)[number]["id"];

export const DEFAULT_NARRATION_VOICE: NarrationVoiceId = NARRATION_VOICES[0].id;

export function isNarrationVoice(id: unknown): id is NarrationVoiceId {
  return NARRATION_VOICES.some((v) => v.id === id);
}

export const startBody = z.object({
  voice: z
    .string()
    .optional()
    .transform((v) => (isNarrationVoice(v) ? v : DEFAULT_NARRATION_VOICE)),
});

const VOICE_KEY = "kami.narration.voice";

/** The voice this device last chose for new narrations. */
export function readVoice(): NarrationVoiceId {
  try {
    const saved = localStorage.getItem(VOICE_KEY);
    return isNarrationVoice(saved) ? saved : DEFAULT_NARRATION_VOICE;
  } catch {
    return DEFAULT_NARRATION_VOICE;
  }
}

export function saveVoice(id: NarrationVoiceId): void {
  try {
    localStorage.setItem(VOICE_KEY, id);
  } catch {
    /* per-device convenience only */
  }
}
