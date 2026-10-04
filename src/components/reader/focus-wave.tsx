/** Decorative attention wave with the reading position dotted on the curve.
 *  The curve and the dot share one sampling function so the dot always sits
 *  exactly on the line; the dot is an HTML element so the stretched SVG can't
 *  squash it into an ellipse. */
const W = 100;
const H = 36;
const PAD = 6;

const KEYS: Array<[number, number]> = [
  [0, 27],
  [0.32, 15],
  [0.64, 20],
  [0.84, 9],
  [1, 14],
];

/** Cosine-eased interpolation through KEYS: smooth, with flat tangents at each key. */
function waveY(t: number): number {
  for (let i = 1; i < KEYS.length; i++) {
    const [t0, y0] = KEYS[i - 1]!;
    const [t1, y1] = KEYS[i]!;
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      const eased = (1 - Math.cos(k * Math.PI)) / 2;
      return y0 + (y1 - y0) * eased;
    }
  }
  return KEYS[KEYS.length - 1]![1];
}

const toX = (t: number) => PAD + t * (W - PAD * 2);

const PATH = Array.from({ length: 101 }, (_, i) => {
  const t = i / 100;
  return `${i === 0 ? "M" : "L"}${toX(t).toFixed(2)},${waveY(t).toFixed(2)}`;
}).join(" ");

export function FocusWave({ percent }: { percent: number }) {
  const t = Math.min(100, Math.max(0, percent)) / 100;
  return (
    <div className="relative h-12 w-full" aria-hidden="true">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 size-full overflow-visible text-ok/60"
        preserveAspectRatio="none"
      >
        <path
          d={PATH}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-hanko"
        style={{ left: `${toX(t)}%`, top: `${(waveY(t) / H) * 100}%` }}
      />
    </div>
  );
}
