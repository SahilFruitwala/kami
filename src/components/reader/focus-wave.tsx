/** Decorative attention wave with the reading position dotted on the curve.
 *  Everything is inset from the viewBox edges so nothing clips. */
export function FocusWave({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  // Piecewise-linear sampling of the wave's key points for the dot position.
  const keys: Array<[number, number]> = [
    [6, 27],
    [34, 15],
    [62, 20],
    [80, 9],
    [94, 14],
  ];
  const x = 6 + (clamped / 100) * 88;
  let y = keys[keys.length - 1]![1];
  for (let i = 1; i < keys.length; i++) {
    const [x0, y0] = keys[i - 1]!;
    const [x1, y1] = keys[i]!;
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      y = y0 + t * (y1 - y0);
      break;
    }
  }
  return (
    <svg
      viewBox="0 0 100 36"
      className="h-12 w-full overflow-visible text-ok/60"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M6,27 Q20,24 34,15 T62,20 T80,9 T94,14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x} cy={y} r="3.5" className="fill-hanko" />
    </svg>
  );
}
