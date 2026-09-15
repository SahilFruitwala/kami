export type PaperTone = "pale" | "aged" | "sumi";

export type PaperToneDef = {
  id: PaperTone;
  /** Full label for tooltips and accessibility. */
  label: string;
  /** Short label shown under the swatch in the preferences panel. */
  shortLabel: string;
  /** Single-letter mark shown on the swatch. */
  glyph: string;
  bg: string;
  fg: string;
  scheme: "light" | "dark";
  /**
   * Theme variables overridden on the reading sheet so article content
   * follows the paper instead of the app theme.
   */
  vars: Record<string, string>;
};

export const PAPER_TONES: PaperToneDef[] = [
  {
    id: "pale",
    label: "Pale Washi",
    shortLabel: "Pale",
    glyph: "P",
    bg: "#FFFDF9",
    fg: "#1d1b18",
    scheme: "light",
    vars: {
      "--color-bg": "#f9f2ed",
      "--color-paper": "#FFFDF9",
      "--color-paper-warm": "#f3ede7",
      "--color-surface": "#FFFDF9",
      "--color-ink": "#1d1b18",
      "--color-ink-soft": "#58413c",
      "--color-ink-muted": "#8c716b",
      "--color-faint": "#c9b8b0",
      "--color-line": "#e7e0d5",
      "--color-ink-accent": "#2d3b48",
    },
  },
  {
    id: "aged",
    label: "Aged Rice Paper",
    shortLabel: "Aged",
    glyph: "A",
    bg: "#F6EFE6",
    fg: "#1d1b18",
    scheme: "light",
    vars: {
      "--color-bg": "#efe5d3",
      "--color-paper": "#F6EFE6",
      "--color-paper-warm": "#ece0cb",
      "--color-surface": "#FBF6EC",
      "--color-ink": "#1d1b18",
      "--color-ink-soft": "#58413c",
      "--color-ink-muted": "#8c716b",
      "--color-faint": "#c9b8b0",
      "--color-line": "#ddd0b8",
      "--color-ink-accent": "#2d3b48",
    },
  },
  {
    id: "sumi",
    label: "Sumi Dark",
    shortLabel: "Sumi",
    glyph: "S",
    bg: "#1D1B18",
    fg: "#EDE7E2",
    scheme: "dark",
    vars: {
      "--color-bg": "#161514",
      "--color-paper": "#1c1b1a",
      "--color-paper-warm": "#211f1e",
      "--color-surface": "#252320",
      "--color-ink": "#EDE7E2",
      "--color-ink-soft": "#C8C2B8",
      "--color-ink-muted": "#8A847C",
      "--color-faint": "#5c564f",
      "--color-line": "#3A3631",
      "--color-ink-accent": "#d4a373",
    },
  },
];

export const TONES: Record<PaperTone, PaperToneDef> = {
  pale: PAPER_TONES[0]!,
  aged: PAPER_TONES[1]!,
  sumi: PAPER_TONES[2]!,
};

export function isPaperTone(value: unknown): value is PaperTone {
  return PAPER_TONES.some((tone) => tone.id === value);
}
