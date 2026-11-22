import {
  useCreateLink,
  useHabitLinks,
  useRemoveLink,
  useSetLinkMode,
} from "@/hooks/use-reading-links.ts";
import { useShelfItems } from "@/hooks/use-shelf-queries.ts";
import type { LinkMode } from "@/lib/api/reading-links";

/**
 * Books that can tick this habit when you update their progress. Optional: a
 * habit with no books behaves as before, and you can always tick it yourself.
 * Changes apply at once (like Pause), not on Save.
 */
export function HabitReadingLinks({ habitId }: { habitId: string }) {
  const links = useHabitLinks(habitId);
  const reading = useShelfItems({ type: "book", status: "in_progress", query: "", limit: 50 });
  const create = useCreateLink();
  const setMode = useSetLinkMode();
  const remove = useRemoveLink();

  const linked = links.data ?? [];
  const linkedIds = new Set(linked.map((l) => l.sourceId));
  const options = (reading.data ?? []).filter((b) => !linkedIds.has(b.id));

  return (
    <div className="cp-field">
      <span>Books that count</span>
      {linked.length > 0 ? (
        <ul style={{ display: "grid", gap: 8, margin: "4px 0 8px", padding: 0, listStyle: "none" }}>
          {linked.map((l) => (
            <li
              key={l.id}
              style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}
            >
              <span style={{ flex: "1 1 100%", minWidth: 0 }}>{l.sourceTitle ?? "A book"}</span>
              <select
                className="cp-input"
                style={{ width: "auto" }}
                aria-label={`When I update ${l.sourceTitle ?? "this book"}`}
                value={l.mode}
                onChange={(e) => setMode.mutate({ id: l.id, mode: e.target.value as LinkMode })}
              >
                <option value="ask">Ask me</option>
                <option value="auto">Tick automatically</option>
                <option value="off">Do nothing</option>
              </select>
              <button
                type="button"
                className="cp-btn cp-btn--sm"
                onClick={() => remove.mutate(l.id)}
                aria-label={`Stop counting ${l.sourceTitle ?? "this book"}`}
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {options.length > 0 ? (
        <select
          className="cp-input"
          aria-label="Add a book you're reading"
          disabled={create.isPending}
          value=""
          onChange={(e) => {
            if (e.target.value) {
              create.mutate({ sourceType: "book", sourceId: e.target.value, habitId });
            }
          }}
        >
          <option value="">Add a book you're reading…</option>
          {options.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      ) : linked.length === 0 ? (
        <small>Mark a book as reading on your Books shelf, then link it here.</small>
      ) : null}
      <small>
        Optional. When you update a linked book, this habit can be ticked for you. Days already
        counted stay if you unlink.
      </small>
    </div>
  );
}
