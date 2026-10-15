import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLibraryStore } from "@/lib/store.ts";
import { collectLibraryTags } from "@/lib/filter-library.ts";
import { Card, FieldLabel, MiniButton } from "@/components/settings/settings-ui.tsx";

export function OrganizeCard() {
  const library = useLibraryStore((s) => s.library);
  const folders = useLibraryStore((s) => s.folders);
  const addFolder = useLibraryStore((s) => s.addFolder);
  const renameFolder = useLibraryStore((s) => s.renameFolder);
  const removeFolder = useLibraryStore((s) => s.removeFolder);
  const renameTagEverywhere = useLibraryStore((s) => s.renameTagEverywhere);
  const removeTagEverywhere = useLibraryStore((s) => s.removeTagEverywhere);
  const [folderDraft, setFolderDraft] = useState("");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeInto, setMergeInto] = useState("");

  const tags = useMemo(() => collectLibraryTags(library), [library]);
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of library) {
      for (const t of row.tags ?? []) map.set(t, (map.get(t) ?? 0) + 1);
    }
    return map;
  }, [library]);

  function saveFolderName(id: string) {
    renameFolder(id, editingFolderName);
    setEditingFolder(null);
  }

  function saveTagName(old: string) {
    const n = renameTagEverywhere(old, editingTagName);
    toast.success(n > 0 ? `Renamed #${old} on ${n} works` : "Tag unchanged");
    setEditingTag(null);
  }

  return (
    <Card
      id="organize"
      title="Organize — folders & tags"
      copy="Rename, merge, and delete from one table. Changes apply to every work at once."
    >
      <div>
        <FieldLabel>Folders ({folders.length})</FieldLabel>
        <ul className="mt-2 space-y-1.5">
          {folders.length === 0 ? (
            <li className="rounded-lg bg-bg/60 px-3 py-2.5 font-body text-sm text-ink-muted italic">
              No slipcases yet — create one below, or from the Library filter row.
            </li>
          ) : null}
          {folders.map((f) => {
            const n = library.filter((row) => row.folderId === f.id).length;
            return (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-bg/60 px-3 py-2 sm:flex-nowrap"
              >
                {editingFolder === f.id ? (
                  <>
                    <input
                      aria-label={`Rename folder ${f.name}`}
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveFolderName(f.id);
                        if (e.key === "Escape") setEditingFolder(null);
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-hanko/30"
                    />
                    <MiniButton onClick={() => saveFolderName(f.id)}>Save</MiniButton>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-sans text-sm text-ink">
                      {f.name}
                    </span>
                    <span className="font-sans text-[11px] text-ink-muted tabular-nums">
                      {n} works
                    </span>
                    <MiniButton
                      onClick={() => {
                        setEditingFolder(f.id);
                        setEditingFolderName(f.name);
                      }}
                    >
                      Rename
                    </MiniButton>
                    <MiniButton
                      danger
                      onClick={() => {
                        if (
                          !window.confirm(`Delete slipcase “${f.name}”? ${n} works become Unfiled.`)
                        )
                          return;
                        removeFolder(f.id);
                        toast.success(`Deleted slipcase “${f.name}”`);
                      }}
                    >
                      Delete
                    </MiniButton>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex gap-1.5">
          <input
            aria-label="New folder name"
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (addFolder(folderDraft)) toast.success("Slipcase created");
              setFolderDraft("");
            }}
            placeholder="New slipcase…"
            autoComplete="off"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-hanko/30"
          />
          <button
            type="button"
            onClick={() => {
              if (addFolder(folderDraft)) toast.success("Slipcase created");
              setFolderDraft("");
            }}
            className="h-9 rounded-lg bg-ink px-4 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            Add
          </button>
        </div>
      </div>

      <div>
        <FieldLabel>Tags ({tags.length})</FieldLabel>
        {tags.length === 0 ? (
          <p className="mt-2 rounded-lg bg-bg/60 px-3 py-2.5 font-body text-sm text-ink-muted italic">
            No tags yet — add one from any open work.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {tags.map((t) => (
              <li
                key={t}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-bg/60 px-3 py-2 sm:flex-nowrap"
              >
                {editingTag === t ? (
                  <>
                    <input
                      aria-label={`Rename tag ${t}`}
                      value={editingTagName}
                      onChange={(e) => setEditingTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTagName(t);
                        if (e.key === "Escape") setEditingTag(null);
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-hanko/30"
                    />
                    <MiniButton onClick={() => saveTagName(t)}>Save</MiniButton>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-sans text-sm text-ink">#{t}</span>
                    <span className="font-sans text-[11px] text-ink-muted tabular-nums">
                      {tagCounts.get(t) ?? 0} works
                    </span>
                    <MiniButton
                      onClick={() => {
                        setEditingTag(t);
                        setEditingTagName(t);
                      }}
                    >
                      Rename
                    </MiniButton>
                    <MiniButton
                      danger
                      onClick={() => {
                        if (!window.confirm(`Remove tag #${t} from every work?`)) return;
                        const n = removeTagEverywhere(t);
                        toast.success(`Removed #${t} from ${n} works`);
                      }}
                    >
                      Delete
                    </MiniButton>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {tags.length >= 2 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="font-sans text-xs text-ink-muted">Merge</span>
            <select
              aria-label="Merge tag from"
              value={mergeFrom}
              onChange={(e) => setMergeFrom(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2 font-sans text-xs text-ink"
            >
              <option value="">From…</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
            <span className="font-sans text-xs text-ink-muted">into</span>
            <select
              aria-label="Merge tag into"
              value={mergeInto}
              onChange={(e) => setMergeInto(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2 font-sans text-xs text-ink"
            >
              <option value="">Into…</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
            <MiniButton
              onClick={() => {
                if (!mergeFrom || !mergeInto || mergeFrom === mergeInto) {
                  toast.error("Pick two different tags to merge.");
                  return;
                }
                const n = renameTagEverywhere(mergeFrom, mergeInto);
                toast.success(`Merged #${mergeFrom} into #${mergeInto} (${n} works)`);
                setMergeFrom("");
                setMergeInto("");
              }}
            >
              Merge
            </MiniButton>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
