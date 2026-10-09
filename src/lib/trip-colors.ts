/**
 * One color per itinerary day on the trip map, so "all days" reads day by
 * day. Fixed order (day 1 is always blue), never cycled: days past the
 * eighth share a neutral gray and are told apart by their number label.
 *
 * Validated as a categorical palette against a light map surface (#f2efe9,
 * OpenStreetMap's land color, which stays light in both app themes). Four
 * hues sit under 3:1 against the tiles, so every pin carries a visible
 * number on a white ring, and light pins use dark text.
 */

export type DayColor = { fill: string; ink: string };

const DARK_INK = "#201b14";
const WHITE = "#ffffff";

export const DAY_COLORS: readonly DayColor[] = [
  { fill: "#2a78d6", ink: WHITE }, // blue
  { fill: "#eb6834", ink: DARK_INK }, // orange
  { fill: "#1baf7a", ink: DARK_INK }, // aqua
  { fill: "#eda100", ink: DARK_INK }, // yellow
  { fill: "#e87ba4", ink: DARK_INK }, // magenta
  { fill: "#008300", ink: WHITE }, // green
  { fill: "#4a3aa7", ink: WHITE }, // violet
  { fill: "#e34948", ink: WHITE }, // red
];

/** Shared by every day after the eighth. */
export const OVERFLOW_DAY_COLOR: DayColor = { fill: "#6b6760", ink: WHITE };

export function dayColor(dayIndex: number): DayColor {
  return DAY_COLORS[dayIndex] ?? OVERFLOW_DAY_COLOR;
}
