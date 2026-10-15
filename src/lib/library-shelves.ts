import type { LibraryItem } from "@/lib/library-item";
import { bookSpineLook, compareTopics, hueOf, topicOf, type TopicId } from "@/lib/gloss/palette";

/** Pure grouping / ordering behind the library's shelf and topics views. */

export type TopicGroups = {
  /** Topic of every item, computed once. */
  topicById: Map<string, TopicId>;
  /** One bucket per topic (in topic order), newest first inside each. */
  buckets: { topic: TopicId; items: LibraryItem[] }[];
};

export function groupByTopic(items: readonly LibraryItem[]): TopicGroups {
  const topicById = new Map<string, TopicId>();
  const by = new Map<TopicId, LibraryItem[]>();
  for (const it of items) {
    const t = topicOf(it);
    topicById.set(it.id, t);
    const list = by.get(t);
    if (list) list.push(it);
    else by.set(t, [it]);
  }
  const buckets = [...by.keys()].sort(compareTopics).map((topic) => ({
    topic,
    items: [...by.get(topic)!].sort((a, b) => b.savedAt - a.savedAt),
  }));
  return { topicById, buckets };
}

export type ShelfArrange = "topic" | "colour" | "recent" | "length";

/** One shelf's order for a non-topic arrangement ("topic" falls back to recent). */
export function arrangeShelf(
  items: readonly LibraryItem[],
  arrange: ShelfArrange,
  topicById: Map<string, TopicId>,
): LibraryItem[] {
  const sorted = [...items];
  if (arrange === "colour") {
    const hue = (it: LibraryItem) =>
      hueOf(bookSpineLook(it, topicById.get(it.id) ?? topicOf(it)).color);
    sorted.sort((a, b) => hue(a) - hue(b));
  } else if (arrange === "length") {
    sorted.sort((a, b) => b.readingMinutes - a.readingMinutes);
  } else {
    sorted.sort((a, b) => b.savedAt - a.savedAt);
  }
  return sorted;
}

/** Headline numbers for the library page. */
export function libraryStats(library: readonly LibraryItem[]) {
  let minutes = 0;
  let inProgress = 0;
  const topics = new Set<TopicId>();
  for (const it of library) {
    topics.add(topicOf(it));
    if (it.archived) continue;
    minutes += it.readingMinutes || 0;
    if ((it.highlights?.length ?? 0) > 0) inProgress += 1;
  }
  return { minutes, topics: topics.size, inProgress };
}
