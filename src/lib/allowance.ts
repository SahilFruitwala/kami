/**
 * Narration allowance arithmetic (see GLOSSARY.md: Narration allowance,
 * Reservation). Pure: the ledger rows come from `allowance_entries`.
 * Tested in scripts/allowance.test.mjs.
 *
 * Every row is a signed number of characters:
 *   grant   (+) the operator adds allowance
 *   reserve (−) a narration starts and sets aside its whole script
 *   release (+) an unfinished narration is deleted; its unspoken part returns
 *
 * So the ledger's sum is what is available to start new narrations, and the
 * Reservation still held by unfinished narrations is reported separately.
 */

export const ALLOWANCE_KINDS = ["grant", "reserve", "release"] as const;
export type AllowanceKind = (typeof ALLOWANCE_KINDS)[number];

export type AllowanceEntry = {
  id: string;
  kind: AllowanceKind;
  /** Signed characters: positive for grant/release, negative for reserve. */
  chars: number;
  note: string;
  narrationId: string | null;
  createdAt: number;
};

/** An unfinished narration's hold on the allowance. */
export type OpenReservation = { reserved: number; spoken: number };

export type AllowanceSummary = {
  /** Characters available to start new narrations. */
  available: number;
  /** Characters set aside by unfinished narrations and not yet spoken. */
  reserved: number;
};

/** A typical long read (~4,000 words), for friendly estimates. */
export const LONG_ARTICLE_CHARS = 24_000;

export function availableChars(entries: Array<Pick<AllowanceEntry, "chars">>): number {
  return entries.reduce((sum, e) => sum + e.chars, 0);
}

export function summarizeAllowance(
  entries: Array<Pick<AllowanceEntry, "chars">>,
  open: OpenReservation[],
): AllowanceSummary {
  return {
    available: availableChars(entries),
    reserved: open.reduce((sum, r) => sum + unspoken(r), 0),
  };
}

/** What deleting an unfinished narration gives back. A finished one gives back nothing. */
export function unspoken({ reserved, spoken }: OpenReservation): number {
  return Math.max(0, reserved - Math.min(spoken, reserved));
}

/** Whether a narration of `needed` characters can start. */
export function canReserve(available: number, needed: number): boolean {
  return needed > 0 && available >= needed;
}

/** "≈ 13 long articles" / "about one long article" / "less than one long article". */
export function longArticlesEstimate(chars: number): string {
  const n = chars / LONG_ARTICLE_CHARS;
  if (n < 1) return "less than one long article";
  const whole = Math.floor(n);
  return whole === 1 ? "about one long article" : `≈ ${whole} long articles`;
}
