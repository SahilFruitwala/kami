import { http, seg } from "./client";
import type { AllowanceEntry } from "@/lib/allowance";
import type { NarrationState, Refusal } from "@/lib/narration-engine";

/** The caller's narration allowance (never the Deepgram balance). */
export type AllowanceView = {
  /** Narration is set up on this server. */
  enabled: boolean;
  available: number;
  reserved: number;
  entries: AllowanceEntry[];
};

/** An article's narration as its owner sees it. */
export type NarrationView = {
  state: NarrationState;
  /** Why it stopped, when paused ("Deepgram is out of funds."). */
  pausedReason: string | null;
  partsDone: number;
  partsTotal: number;
  /** Characters reserved for it. */
  scriptChars: number;
  /** The article's text changed since this audio was made. */
  stale: boolean;
  durationSeconds: number | null;
  /** Where the owner stopped listening. */
  positionSeconds: number;
  createdAt: number;
};

/** Create audio either starts (or reports) a narration, or says why it can't. */
export type StartNarrationResult =
  { ok: true; narration: NarrationView } | { ok: false; refusal: Refusal };

export const narrationApi = {
  allowance: () => http.get<AllowanceView>("/api/allowance"),

  /** The article's narration, or null when it has none. */
  get: (articleId: string) => http.get<NarrationView | null>(`/api/narrations/${seg(articleId)}`),

  /** Create, resume or re-create (when stale) the article's narration. */
  start: (articleId: string) =>
    http.post<StartNarrationResult>(`/api/narrations/${seg(articleId)}`),

  remove: (articleId: string) => http.delete<void>(`/api/narrations/${seg(articleId)}`),

  /** A short-lived URL that plays the finished audio. */
  audio: (articleId: string) =>
    http.get<{ url: string; expiresAt: number }>(`/api/narrations/${seg(articleId)}/audio`),

  savePosition: (articleId: string, seconds: number) =>
    http.put<void>(`/api/narrations/${seg(articleId)}/position`, { seconds }),
};
