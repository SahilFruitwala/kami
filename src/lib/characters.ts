/** Built-in portraits that replace Clerk's generic silhouette. */

export const CHARACTER_IDS = [
  "kitsune",
  "neko",
  "tsuru",
  "fukuro",
  "usagi",
  "tanuki",
  "koi",
  "shiba",
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export type Character = {
  id: CharacterId;
  /** Japanese name shown in the picker. */
  label: string;
  /** Short English gloss for the accessible name. */
  gloss: string;
  src: string;
};

export const CHARACTERS: readonly Character[] = [
  { id: "kitsune", label: "Kitsune", gloss: "fox", src: "/avatars/kitsune.webp" },
  { id: "neko", label: "Neko", gloss: "cat", src: "/avatars/neko.webp" },
  { id: "tsuru", label: "Tsuru", gloss: "crane", src: "/avatars/tsuru.webp" },
  { id: "fukuro", label: "Fukuro", gloss: "owl", src: "/avatars/fukuro.webp" },
  { id: "usagi", label: "Usagi", gloss: "rabbit", src: "/avatars/usagi.webp" },
  { id: "tanuki", label: "Tanuki", gloss: "raccoon dog", src: "/avatars/tanuki.webp" },
  { id: "koi", label: "Koi", gloss: "carp", src: "/avatars/koi.webp" },
  { id: "shiba", label: "Shiba", gloss: "dog", src: "/avatars/shiba.webp" },
];

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));

export const CHARACTER_STORAGE_KEY = "kami-character";
export const CHARACTER_METADATA_KEY = "kamiCharacterId";

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === "string" && BY_ID.has(value as CharacterId);
}

export function characterById(id: CharacterId): Character {
  const character = BY_ID.get(id);
  if (!character) throw new Error(`Unknown character: ${id}`);
  return character;
}

/** Stable default so two visits of the same account see the same portrait. */
export function characterForSeed(seed: string): CharacterId {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return CHARACTER_IDS[(hash >>> 0) % CHARACTER_IDS.length];
}
