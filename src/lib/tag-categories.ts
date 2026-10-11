/**
 * The fixed set of categories Auto-tag may use. Keeping the list closed stops
 * near-duplicates ("ai", "artificial intelligence", "machine learning") from
 * piling up; users can still add their own free-form tags by hand.
 */
export const TAG_CATEGORIES = [
  "technology",
  "science",
  "business",
  "finance",
  "politics",
  "health",
  "culture",
  "history",
  "design",
  "education",
  "travel",
  "food",
  "sports",
  "opinion",
  "other",
] as const;

export type TagCategory = (typeof TAG_CATEGORIES)[number];
