import { createDeepgram } from "@ai-sdk/deepgram";
import { APICallError, RetryError, generateSpeech, type SpeechModel } from "ai";

/**
 * Speaking one Narration part through the AI SDK's Deepgram provider.
 * One fixed voice (Aura-2 Thalia), MP3 at 48 kbps, one SDK retry for
 * transient errors. Failures are classified so the narration run knows
 * whether to pause for good (bad key, no funds) or try again later.
 * Tested in scripts/narration-io.test.mjs with a fake speech model.
 */

export const NARRATION_MODEL = "aura-2-thalia-en";

export function deepgramSpeechModel(apiKey: string): SpeechModel {
  return createDeepgram({ apiKey }).speech(NARRATION_MODEL);
}

export type SpokenPart = {
  audio: Uint8Array;
  /** Characters Deepgram billed, when it reports them. */
  chars: number | null;
  /** Deepgram's request id, for support and reconciling usage. */
  requestId: string | null;
};

/** Why speaking failed: `permanent` needs the operator (key, funds); `transient` may clear. */
export class SpeechError extends Error {
  readonly kind: "permanent" | "transient";
  readonly status: number | null;

  constructor(kind: "permanent" | "transient", status: number | null, message: string) {
    super(message);
    this.name = "SpeechError";
    this.kind = kind;
    this.status = status;
  }
}

/** 401 bad key, 402 out of funds, 403 not allowed: retrying can't help. */
const PERMANENT_STATUSES = new Set([401, 402, 403]);

export function classifySpeechError(err: unknown): SpeechError {
  if (err instanceof SpeechError) return err;
  const cause = RetryError.isInstance(err) ? err.lastError : err;
  if (APICallError.isInstance(cause)) {
    const status = cause.statusCode ?? null;
    if (status !== null && PERMANENT_STATUSES.has(status)) {
      const reason =
        status === 402
          ? "Deepgram is out of funds."
          : "Deepgram refused the request (check the API key).";
      return new SpeechError("permanent", status, reason);
    }
    if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) {
      // A request we built wrong (too long, empty, bad options): not worth repeating.
      return new SpeechError("permanent", status, `Deepgram rejected the text (${status}).`);
    }
    return new SpeechError("transient", status, "Deepgram didn't answer. Try again later.");
  }
  return new SpeechError("transient", null, "Deepgram didn't answer. Try again later.");
}

export async function speakPart(
  model: SpeechModel,
  text: string,
  abortSignal?: AbortSignal,
): Promise<SpokenPart> {
  try {
    const result = await generateSpeech({
      model,
      text,
      outputFormat: "mp3",
      providerOptions: { deepgram: { encoding: "mp3", bitRate: 48000 } },
      maxRetries: 1,
      abortSignal,
    });
    const meta = result.providerMetadata?.deepgram as { charCount?: unknown } | undefined;
    const headers = result.responses.at(-1)?.headers ?? {};
    return {
      audio: result.audio.uint8Array,
      chars: typeof meta?.charCount === "number" ? meta.charCount : null,
      requestId: headers["dg-request-id"] ?? null,
    };
  } catch (err) {
    throw classifySpeechError(err);
  }
}
