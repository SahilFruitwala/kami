import { useEffect, useRef, useState } from "react";
import { Folder, Plus, X } from "lucide-react";
import { useLibraryStore, type LibraryItem } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

export function OrganizeRow({ item }: { item: LibraryItem }) {
  const folders = useLibraryStore((s) => s.folders);
  const addFolder = useLibraryStore((s) => s.addFolder);
  const setItemFolder = useLibraryStore((s) => s.setItemFolder);
  const addTag = useLibraryStore((s) => s.addTag);
  const removeTag = useLibraryStore((s) => s.removeTag);
  const [folderOpen, setFolderOpen] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [folderDraft, setFolderDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const folder = folders.find((row) => row.id === item.folderId);

  useEffect(() => {
    if (!folderOpen && !addingTag) return;
    const onDoc = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) {
        setFolderOpen(false);
        setAddingTag(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [folderOpen, addingTag]);

  function createFolder() {
    const id = addFolder(folderDraft);
    if (id) setItemFolder(item.id, id);
    setFolderDraft("");
    setFolderOpen(false);
  }

  function submitTag() {
    addTag(item.id, tagDraft);
    setTagDraft("");
    setAddingTag(false);
  }

  return (
    <div ref={boxRef} className="relative mt-5">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Article organization">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={folderOpen}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 shadow-border",
            folder
              ? "bg-paper-warm text-ink font-semibold"
              : "bg-surface text-ink hover:bg-paper-warm",
          )}
          onClick={() => {
            setFolderOpen((open) => !open);
            setAddingTag(false);
          }}
        >
          <Folder className="size-3.5" aria-hidden="true" />
          {folder?.name ?? "File"}
        </button>
        {item.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-paper-warm pl-3.5 pr-1.5 text-sm font-medium text-ink shadow-border"
          >
            #{tag}
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(item.id, tag)}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        {addingTag ? (
          <input
            autoFocus
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitTag();
              }
              if (e.key === "Escape") setAddingTag(false);
            }}
            onBlur={() => {
              if (tagDraft.trim()) submitTag();
              else setAddingTag(false);
            }}
            placeholder="Tag name…"
            className="h-9 w-28 rounded-full bg-surface border border-line px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-ink/30"
          />
        ) : (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-medium text-ink hover:bg-paper-warm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 shadow-border"
            onClick={() => {
              setAddingTag(true);
              setFolderOpen(false);
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Tag
          </button>
        )}
      </div>

      {folderOpen ? (
        <div
          role="menu"
          aria-label="Select folder"
          className="absolute left-0 z-10 mt-2 w-60 rounded-xl bg-surface p-2 shadow-device border border-line"
        >
          <button
            type="button"
            role="menuitem"
            className="flex h-10 w-full items-center rounded-lg px-3 text-left text-sm font-medium text-ink hover:bg-paper-warm transition-colors"
            onClick={() => {
              setItemFolder(item.id, null);
              setFolderOpen(false);
            }}
          >
            Unfiled
          </button>
          {folders.map((row) => (
            <button
              key={row.id}
              type="button"
              role="menuitem"
              className={cn(
                "flex h-10 w-full items-center rounded-lg px-3 text-left text-sm font-medium transition-colors",
                row.id === item.folderId
                  ? "bg-paper-warm text-ink font-semibold"
                  : "text-ink hover:bg-paper-warm",
              )}
              onClick={() => {
                setItemFolder(item.id, row.id);
                setFolderOpen(false);
              }}
            >
              {row.name}
            </button>
          ))}
          <div className="mt-1 flex gap-1.5 border-t border-line pt-2">
            <input
              value={folderDraft}
              onChange={(e) => setFolderDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createFolder();
                }
                if (e.key === "Escape") {
                  setFolderOpen(false);
                }
              }}
              placeholder="New folder…"
              className="h-9 min-w-0 flex-1 rounded-lg bg-paper px-2.5 text-sm text-ink outline-none placeholder:text-ink-muted border border-line focus:ring-2 focus:ring-ink/30"
            />
            <button
              type="button"
              className="h-9 rounded-lg bg-ink px-3 text-sm font-medium text-paper hover:bg-ink-soft transition-colors"
              onClick={createFolder}
            >
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
