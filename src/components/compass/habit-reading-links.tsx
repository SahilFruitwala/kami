import {
  useCreateLink,
  useHabitLinks,
  useRemoveLink,
  useSetLinkMode,
} from "@/hooks/use-reading-links.ts";
import { useShelfItems } from "@/hooks/use-shelf-queries.ts";
import { useLibraryStore } from "@/lib/store";
import type { LinkMode, ReadingLink } from "@/lib/api/reading-links";

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

  const all = links.data ?? [];
  // Finished books keep their link (and the days it counted) but step out of the way.
  const current = all.filter((l) => l.sourceStatus !== "done");
  const finished = all.filter((l) => l.sourceStatus === "done");
  const linkedIds = new Set(all.map((l) => l.sourceId));
  const options = (reading.data ?? []).filter((b) => !linkedIds.has(b.id));
  const folders = useLibraryStore((st) => st.folders).filter((f) => !linkedIds.has(f.id));

  const list = (items: ReadingLink[]) => (
    <ul style={{ display: "grid", gap: 8, margin: "4px 0 8px", padding: 0, listStyle: "none" }}>
      {items.map((l) => (
        <li key={l.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ flex: "1 1 100%", minWidth: 0 }}>
            {l.sourceType === "folder" ? "Folder: " : ""}
            {l.sourceTitle ?? (l.sourceType === "folder" ? "A folder" : "A book")}
          </span>
          <select
            className="cp-input"
            style={{ width: "auto" }}
            aria-label={
              l.sourceType === "folder"
                ? `When an article in ${l.sourceTitle ?? "this folder"} is archived`
                : `When I update ${l.sourceTitle ?? "this book"}`
            }
            value={l.mode}
            onChange={(e) => setMode.mutate({ id: l.id, mode: e.target.value as LinkMode })}
          >
            {l.sourceType === "book" ? <option value="ask">Ask me</option> : null}
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
  );

  return (
    <div className="cp-field">
      <span>Reading that counts</span>
      {current.length > 0 ? list(current) : null}
      {options.length > 0 ? (
        <select
          className="cp-input"
          aria-label="Add a book you're reading"
          disabled={create.isPending}
          value=""
          onChange={(e) => {
            if (e.target.value) {
              create.mutate({
                sourceType: "book",
                sourceId: e.target.value,
                targetType: "habit",
                targetId: habitId,
              });
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
      ) : all.length === 0 ? (
        <small>Mark a book as reading on your Books shelf, then link it here.</small>
      ) : null}
      {folders.length > 0 ? (
        <select
          className="cp-input"
          style={{ marginTop: 8 }}
          aria-label="Add a saved-posts folder"
          disabled={create.isPending}
          value=""
          onChange={(e) => {
            if (e.target.value) {
              create.mutate({
                sourceType: "folder",
                sourceId: e.target.value,
                targetType: "habit",
                targetId: habitId,
                mode: "auto",
              });
            }
          }}
        >
          <option value="">Add a saved-posts folder…</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      ) : null}
      {finished.length > 0 ? (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer" }}>Finished books ({finished.length})</summary>
          {list(finished)}
        </details>
      ) : null}
      <small>
        Optional. When you update a linked book, or archive an article in a linked folder, this
        habit can be ticked for you. Days already counted stay if you unlink.
      </small>
    </div>
  );
}
