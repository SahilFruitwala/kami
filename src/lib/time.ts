export function relativeTime(ts: number): string {
  const deltaSec = Math.round((Date.now() - ts) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(deltaSec) < 60) return "just now";
  const minutes = Math.round(deltaSec / 60);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 14) return rtf.format(-days, "day");
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
