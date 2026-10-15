import { TAG_CATEGORIES, type TagCategory } from "@/lib/tag-categories.ts";
import type { LibraryItem } from "@/lib/library-item.ts";
import type { ItemStatus } from "@/lib/schema.ts";

/**
 * Gloss colour lives in the content: every tag owns a family of shades so a
 * shelf reads as one colour with natural variation. Spines pick from the
 * family; covers use the darkest; endpapers and chip backgrounds the tint.
 * The built-in categories have hand-picked families; any other tag borrows
 * one, chosen by hashing its name so it stays the same.
 */
export type TopicFamily = {
  dark: string;
  mid: string;
  light: string;
  tint: string;
};

/** A shelf group: an article's first tag (lower-cased), or "unsorted" when it has none. */
export type TopicId = string;

type KnownTopic = TagCategory | "unsorted";

const TOPIC_FAMILIES: Record<KnownTopic, TopicFamily> = {
  technology: { dark: "#42356B", mid: "#6B58A8", light: "#A797D6", tint: "#ECE8F4" },
  science: { dark: "#385A3F", mid: "#4A774C", light: "#9DB89A", tint: "#E3ECDC" },
  business: { dark: "#2F3E77", mid: "#4A5FA8", light: "#93A3D6", tint: "#E8ECF6" },
  finance: { dark: "#5C6324", mid: "#7F8A36", light: "#B7BE7A", tint: "#EEF0DC" },
  politics: { dark: "#6E2457", mid: "#9B3A7C", light: "#D59BC4", tint: "#F5EAEE" },
  health: { dark: "#2E6B5E", mid: "#3F8A78", light: "#8CC2B2", tint: "#E6F0EC" },
  culture: { dark: "#5D3D2E", mid: "#8A5A47", light: "#C9A493", tint: "#F1E0D8" },
  history: { dark: "#7A5418", mid: "#A87628", light: "#DDB977", tint: "#F5EBD6" },
  design: { dark: "#7E2F25", mid: "#B0473A", light: "#E09A8E", tint: "#F7E5E1" },
  education: { dark: "#2B4A5E", mid: "#3F6A84", light: "#93B4C8", tint: "#E5EEF3" },
  travel: { dark: "#1F5F72", mid: "#2F8399", light: "#86C0CE", tint: "#E1F0F3" },
  food: { dark: "#8A3F1C", mid: "#BF6331", light: "#E9A87F", tint: "#F8E8DD" },
  sports: { dark: "#2F5A2A", mid: "#4C8240", light: "#A3C68E", tint: "#E6F0DE" },
  opinion: { dark: "#5A2338", mid: "#863550", light: "#CF8FA6", tint: "#F3E3E9" },
  other: { dark: "#4E4A42", mid: "#7A746A", light: "#B9B2A6", tint: "#EEEBE5" },
  unsorted: { dark: "#5E574B", mid: "#857C6D", light: "#C2B9A8", tint: "#EFEBE3" },
};

const TOPIC_LABELS: Record<KnownTopic, string> = {
  technology: "Technology",
  science: "Science",
  business: "Business",
  finance: "Finance",
  politics: "Politics",
  health: "Health",
  culture: "Culture",
  history: "History",
  design: "Design",
  education: "Education",
  travel: "Travel",
  food: "Food",
  sports: "Sports",
  opinion: "Opinion",
  other: "Other",
  unsorted: "Unsorted",
};

const TOPIC_BLURBS: Record<KnownTopic, string> = {
  technology: "Machines, software and the people who build them.",
  science: "How the world works, one careful experiment at a time.",
  business: "Companies, markets and the craft of making things people buy.",
  finance: "Money, where it goes, and why it moves.",
  politics: "Power, policy and the arguments that shape them.",
  health: "Bodies, minds and the science of feeling better.",
  culture: "Books, film, music and the stories we tell each other.",
  history: "What happened, and what it still means.",
  design: "Form, type and the quiet decisions behind good things.",
  education: "Learning, teaching and the long road to understanding.",
  travel: "Places worth the trip, and how to see them well.",
  food: "Kitchens, recipes and the pleasure of eating well.",
  sports: "Games, athletes and the drama of competition.",
  opinion: "Essays that take a side and argue it well.",
  other: "Pieces that refuse a neat label.",
  unsorted: "Not tagged yet. Auto-tag sorts these onto the right shelf.",
};

function isKnown(topic: TopicId): topic is KnownTopic {
  return Object.hasOwn(TOPIC_FAMILIES, topic);
}

/** Families a free-form tag can borrow (not the greys of Other / Unsorted). */
const BORROWABLE = TAG_CATEGORIES.filter((c) => c !== "other").map((c) => TOPIC_FAMILIES[c]);

export function topicFamily(topic: TopicId): TopicFamily {
  if (isKnown(topic)) return TOPIC_FAMILIES[topic];
  return BORROWABLE[hashString(topic) % BORROWABLE.length]!;
}

/** Short words that read as acronyms when a tag is typed all lower-case. */
const ACRONYMS = new Set([
  "ai",
  "ml",
  "llm",
  "api",
  "ui",
  "ux",
  "ar",
  "vr",
  "seo",
  "saas",
  "css",
  "html",
  "sql",
  "nft",
  "diy",
  "usa",
  "uk",
  "eu",
  "us",
  "ceo",
  "vc",
  "yc",
  "gpt",
  "os",
  "pc",
  "tv",
  "nba",
  "nfl",
  "f1",
  "3d",
]);

/**
 * Display name for a shelf. Pass the article's tags to keep how you wrote the
 * tag ("iOS", "AI"); an all lower-case tag gets title case, with known
 * acronyms in capitals.
 */
export function topicLabel(topic: TopicId, tags?: readonly string[]): string {
  if (isKnown(topic)) return TOPIC_LABELS[topic];
  const written = tags?.map((t) => t.trim()).find((t) => t.toLowerCase() === topic);
  if (written && written !== topic) return written;
  return topic.replace(/[\p{L}\p{N}]+/gu, (w) =>
    ACRONYMS.has(w) ? w.toUpperCase() : w[0]!.toUpperCase() + w.slice(1),
  );
}

export function topicBlurb(topic: TopicId): string {
  if (isKnown(topic)) return TOPIC_BLURBS[topic];
  return `Everything you've tagged “${topic}”.`;
}

const CATEGORY_RANK = new Map<string, number>(TAG_CATEGORIES.map((c, i) => [c, i]));

/** Display order for shelves and chips: built-in categories, then other tags A–Z, then Unsorted. */
export function compareTopics(a: TopicId, b: TopicId): number {
  const rank = (t: TopicId) =>
    t === "unsorted" ? Infinity : (CATEGORY_RANK.get(t) ?? CATEGORY_RANK.size);
  return rank(a) - rank(b) || a.localeCompare(b);
}

/** The shelf an article sits on: its first tag, else "unsorted". */
export function topicOf(item: Pick<LibraryItem, "tags">): TopicId {
  const first = item.tags?.find((t) => t.trim());
  return first ? first.trim().toLowerCase() : "unsorted";
}

/** Small, stable string hash (FNV-1a) → unsigned 32-bit int. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) so a spine looks the same on every visit. */
export function seeded(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TitleStyle = "serif" | "italic" | "caps";

export type BookSpineLook = {
  width: number;
  height: number;
  color: string;
  ink: string;
  titleStyle: TitleStyle;
  label: boolean;
  ribbon: boolean;
  /** Small mark at the top of the spine. */
  mark: boolean;
};

/**
 * Vary at least four things per spine — width, height, shade, title style,
 * label panel — so the shelf looks hand-collected rather than generated.
 * Width tracks reading time.
 */
export function bookSpineLook(item: LibraryItem, topic: TopicId): BookSpineLook {
  const rand = seeded(item.id);
  const fam = topicFamily(topic);
  const minutes = Math.max(1, item.readingMinutes || 1);
  const width = Math.round(28 + Math.min(36, Math.log2(minutes + 1) * 7.5) + rand() * 4);
  const height = Math.round(200 + rand() * 50);
  const shades = [fam.dark, fam.mid, fam.mid, fam.light];
  const color = shades[Math.floor(rand() * shades.length)]!;
  const ink = color === fam.light ? fam.dark : "#F6F1DE";
  const styles: TitleStyle[] = ["serif", "italic", "caps"];
  return {
    width,
    height,
    color,
    ink,
    titleStyle: styles[Math.floor(rand() * styles.length)]!,
    label: rand() < 0.3,
    // A bookmark ribbon marks pieces you've started (highlights exist).
    ribbon: (item.highlights?.length ?? 0) > 0 && !item.archived,
    mark: rand() < 0.35,
  };
}

/** Hue (0–360) of a hex colour, used by "Arrange by colour". */
export function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** CSS custom properties for a topic family (used by endpaper, cards, chips). */
export function familyVars(fam: TopicFamily): Record<string, string> {
  return {
    "--dark": fam.dark,
    "--mid": fam.mid,
    "--light": fam.light,
    "--tint": fam.tint,
    "--cover": fam.dark,
    "--spine-dark": fam.dark,
  };
}

/* ——— Video shelf (VHS sleeves / DVD cases) ——— */

/** Rental-shop sleeve colours: printed cardboard, a little faded. */
const SLEEVES: { sleeve: string; ink: string; band: string }[] = [
  { sleeve: "#141312", ink: "#F3EDE0", band: "#C8392E" },
  { sleeve: "#1E2A55", ink: "#F3EDE0", band: "#E9B949" },
  { sleeve: "#7D1F1A", ink: "#F6E7C8", band: "#141312" },
  { sleeve: "#E7DDC6", ink: "#1E1B16", band: "#2F5E8C" },
  { sleeve: "#E9B949", ink: "#1E1B16", band: "#141312" },
  { sleeve: "#24493F", ink: "#EFE6CF", band: "#D9673A" },
  { sleeve: "#F4F1EA", ink: "#B8242A", band: "#1A1A1A" },
  { sleeve: "#3B2A4F", ink: "#F0DFA8", band: "#5FB3B3" },
];

const STICKERS = ["BE KIND REWIND", "NEW RELEASE", "2 NIGHTS", "STAFF PICK"] as const;

export type VhsLook = {
  width: number;
  height: number;
  sleeve: string;
  ink: string;
  band: string;
  /** Rental sticker on the spine, or null. */
  sticker: (typeof STICKERS)[number] | null;
  stickerColor: string;
  titleSize: number;
};

export function vhsLook(id: string, title: string): VhsLook {
  const rand = seeded(id);
  const s = SLEEVES[Math.floor(rand() * SLEEVES.length)]!;
  const roll = rand();
  return {
    width: Math.round(36 + rand() * 6),
    height: Math.round(196 + rand() * 10),
    sleeve: s.sleeve,
    ink: s.ink,
    band: s.band,
    sticker: roll < 0.22 ? STICKERS[Math.floor(rand() * STICKERS.length)]! : null,
    stickerColor: ["#F2D23C", "#F05A3C", "#4FB6E8", "#9BDB5A"][Math.floor(rand() * 4)]!,
    titleSize: title.length > 24 ? 9 : title.length > 18 ? 10 : title.length > 12 ? 11.5 : 13.5,
  };
}

/** DVD keepcase colours: mostly black, the odd collector's blue or clear. */
const CASES: { case: string; ink: string }[] = [
  { case: "#111214", ink: "#F2F2F2" },
  { case: "#111214", ink: "#F2F2F2" },
  { case: "#16345F", ink: "#F2F2F2" },
  { case: "#1B1B1F", ink: "#E8C66A" },
  { case: "#8E9399", ink: "#111214" },
  { case: "#5A1820", ink: "#F2E6D0" },
];

export type DvdLook = {
  width: number;
  height: number;
  case: string;
  ink: string;
  /** Box sets get a little stripe per "disc". */
  discs: number;
  titleSize: number;
};

/** Thin keepcase for a mini-series, fat box set for a long-running show. */
export function dvdLook(id: string, title: string, totalEpisodes: number | null): DvdLook {
  const rand = seeded(id);
  const c = CASES[Math.floor(rand() * CASES.length)]!;
  const eps = totalEpisodes ?? 0;
  const discs = eps <= 0 ? 1 : Math.min(5, Math.max(1, Math.round(eps / 12)));
  return {
    width: Math.round(20 + (discs - 1) * 9 + rand() * 3),
    height: Math.round(206 + rand() * 6),
    case: c.case,
    ink: c.ink,
    discs,
    titleSize: title.length > 24 ? 9 : title.length > 16 ? 10 : 11.5,
  };
}

/** Closed sleeve / keepcase sizes at full scale (px). */
export const VHS_COVER = { w: 350, h: 630 };
export const DVD_COVER = { w: 420, h: 594 };

export const STATUS_DOT: Record<ItemStatus, string> = {
  to_try: "#5E8C61",
  in_progress: "#C9902E",
  done: "#B8443A",
  abandoned: "#8A857A",
};

/* ——— Shelved books ——— */

const BOOK_TOPICS: TagCategory[] = [
  "technology",
  "science",
  "business",
  "health",
  "culture",
  "history",
  "design",
  "education",
  "travel",
  "food",
  "opinion",
];

/** Spine look for a shelved book, seeded by id so it never changes. */
export function shelfBookLook(item: { id: string; title: string }) {
  const rand = seeded(item.id);
  const topic = BOOK_TOPICS[Math.floor(rand() * BOOK_TOPICS.length)]!;
  const fam = TOPIC_FAMILIES[topic];
  const shades = [fam.dark, fam.mid, fam.mid, fam.light];
  const color = shades[Math.floor(rand() * shades.length)]!;
  return {
    topic,
    fam,
    color,
    ink: color === fam.light ? fam.dark : "#F6F1DE",
    width: Math.round(28 + Math.min(18, item.title.length * 0.6) + rand() * 10),
    height: Math.round(200 + rand() * 50),
    italic: rand() < 0.35,
  };
}

/* ——— Wishlist gift boxes ——— */

const WRAPS: { paper: string; ink: string; ribbon: string }[] = [
  { paper: "#B8443A", ink: "#F6E7C8", ribbon: "#E8C66A" },
  { paper: "#2F5E8C", ink: "#F3EDE0", ribbon: "#F3EDE0" },
  { paper: "#24493F", ink: "#EFE6CF", ribbon: "#D9673A" },
  { paper: "#E7DDC6", ink: "#1E1B16", ribbon: "#B8443A" },
  { paper: "#3B2A4F", ink: "#F0DFA8", ribbon: "#E9B949" },
  { paper: "#E9B949", ink: "#1E1B16", ribbon: "#24493F" },
];

export function giftLook(id: string, title: string) {
  const rand = seeded(id);
  const w = WRAPS[Math.floor(rand() * WRAPS.length)]!;
  return {
    ...w,
    width: Math.round(34 + Math.min(14, title.length * 0.4) + rand() * 12),
    height: Math.round(176 + rand() * 44),
  };
}

export const GIFT_COVER = { w: 400, h: 520 };
export const BOOK_COVER = { w: 430, h: 620 };

export type MediaShelfKind = "vhs" | "dvd" | "book" | "gift";

export function mediaCoverSize(kind: MediaShelfKind) {
  return kind === "vhs"
    ? VHS_COVER
    : kind === "dvd"
      ? DVD_COVER
      : kind === "book"
        ? BOOK_COVER
        : GIFT_COVER;
}

/** Depth of the pulled-out object relative to its height (spine view vs. cover view). */
export function mediaDepthRatio(
  kind: MediaShelfKind,
  view: "spine" | "cover",
  item: { id: string; title: string; totalEpisodes: number | null },
) {
  if (view === "cover") return kind === "vhs" ? 0.15 : kind === "gift" ? 0.18 : 0.06;
  const l =
    kind === "vhs"
      ? vhsLook(item.id, item.title)
      : kind === "dvd"
        ? dvdLook(item.id, item.title, item.totalEpisodes)
        : kind === "book"
          ? shelfBookLook(item)
          : giftLook(item.id, item.title);
  return l.width / l.height;
}
