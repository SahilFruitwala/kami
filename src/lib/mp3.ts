/**
 * Join MP3 parts into one file. Each Deepgram response is a separate MP3
 * stream that may open with an ID3v2 tag and a Xing/Info (or VBRI) header
 * frame describing only that part; left in, browsers can take the first
 * part's length for the whole file and seek wrongly. So every part is reduced
 * to its audio frames, the frames are concatenated, and the duration comes
 * from counting frames rather than from file size.
 * Tested in scripts/narration-io.test.mjs.
 */

// Bitrates in kbps by [MPEG-1 | MPEG-2/2.5][layer III] and index.
const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

export type Mp3Frame = { offset: number; length: number; samples: number; sampleRate: number };

/** Parse the 4-byte frame header at `i`, or null when it isn't a Layer III frame. */
export function readFrameHeader(bytes: Uint8Array, i: number): Omit<Mp3Frame, "offset"> | null {
  if (i + 4 > bytes.length) return null;
  if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) return null;
  const version = (bytes[i + 1] >> 3) & 0b11; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const layer = (bytes[i + 1] >> 1) & 0b11; // 1 = Layer III
  if (version === 1 || layer !== 1) return null;
  const bitrateIndex = bytes[i + 2] >> 4;
  const rateIndex = (bytes[i + 2] >> 2) & 0b11;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const padding = (bytes[i + 2] >> 1) & 1;
  const kbps = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex];
  const sampleRate = SAMPLE_RATES[version][rateIndex];
  const samples = version === 3 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + padding;
  return { length, samples, sampleRate };
}

/** Bytes to skip for a leading ID3v2 tag (10-byte header + syncsafe size + optional footer). */
function id3v2Length(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0;
  const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
  const footer = bytes[5] & 0x10 ? 10 : 0;
  return 10 + size + footer;
}

function hasTag(bytes: Uint8Array, start: number, end: number, tag: string): boolean {
  outer: for (let i = start; i + tag.length <= end; i++) {
    for (let j = 0; j < tag.length; j++) {
      if (bytes[i + j] !== tag.charCodeAt(j)) continue outer;
    }
    return true;
  }
  return false;
}

/** A Xing/Info/VBRI header frame: metadata about the stream, not audio. */
function isInfoFrame(bytes: Uint8Array, frame: Mp3Frame): boolean {
  const end = Math.min(bytes.length, frame.offset + Math.min(frame.length, 64));
  const start = frame.offset + 4;
  return (
    hasTag(bytes, start, end, "Xing") ||
    hasTag(bytes, start, end, "Info") ||
    hasTag(bytes, start, end, "VBRI")
  );
}

/** The audio frames of one MP3 stream, skipping tags, header frames and junk. */
export function audioFrames(bytes: Uint8Array): Mp3Frame[] {
  const frames: Mp3Frame[] = [];
  let end = bytes.length;
  // A trailing ID3v1 tag is 128 bytes starting with "TAG".
  if (end >= 128 && hasTag(bytes, end - 128, end - 125, "TAG")) end -= 128;
  let i = id3v2Length(bytes);
  let first = true;
  while (i + 4 <= end) {
    const header = readFrameHeader(bytes, i);
    if (!header || i + header.length > end) {
      i += 1; // resync on the next sync word
      continue;
    }
    const frame = { offset: i, ...header };
    if (!(first && isInfoFrame(bytes, frame))) frames.push(frame);
    first = false;
    i += header.length;
  }
  return frames;
}

export type JoinedMp3 = { bytes: Uint8Array; frames: number; durationSeconds: number };

/** Concatenate the audio frames of every part, in order. */
export function joinMp3(parts: Uint8Array[]): JoinedMp3 {
  const perPart = parts.map((bytes) => ({ bytes, frames: audioFrames(bytes) }));
  const total = perPart.reduce((n, p) => n + p.frames.reduce((m, f) => m + f.length, 0), 0);
  const out = new Uint8Array(total);
  let at = 0;
  let seconds = 0;
  let count = 0;
  for (const { bytes, frames } of perPart) {
    for (const f of frames) {
      out.set(bytes.subarray(f.offset, f.offset + f.length), at);
      at += f.length;
      seconds += f.samples / f.sampleRate;
      count += 1;
    }
  }
  return { bytes: out, frames: count, durationSeconds: seconds };
}
