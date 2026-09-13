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
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm",
            folder ? "bg-paper-warm text-ink" : "text-muted hover:bg-paper-warm hover:text-ink",
          )}
          onClick={() => {
            setFolderOpen((open) => !open);
            setAddingTag(false);
          }}
        >
          <Folder className="size-3.5" />
          {folder?.name ?? "File"}
        </button>
        {item.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex h-9 items-center gap-1 rounded-full bg-paper-warm pl-3 pr-1 text-sm text-ink-soft"
          >
            {tag}
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded-full hover:text-ink"
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(item.id, tag)}
            >
              <X className="size-3" />
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
            placeholder="Tag name"
            className="h-9 w-28 rounded-full bg-paper-warm px-3 text-sm text-ink outline-none placeholder:text-muted"
          />
        ) : (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm text-muted hover:bg-paper-warm hover:text-ink"
            onClick={() => {
              setAddingTag(true);
              setFolderOpen(false);
            }}
          >
            <Plus className="size-3.5" />
            Tag
          </button>
        )}
      </div>

      {folderOpen ? (
        <div className="absolute left-0 z-10 mt-2 w-56 rounded-lg bg-surface p-2 shadow-border">
          <button
            type="button"
            className="flex h-10 w-full items-center rounded-md px-2 text-left text-sm hover:bg-paper-warm"
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
              className={cn(
                "flex h-10 w-full items-center rounded-md px-2 text-left text-sm hover:bg-paper-warm",
                row.id === item.folderId && "bg-paper-warm",
              )}
              onClick={() => {
                setItemFolder(item.id, row.id);
                setFolderOpen(false);
              }}
            >
              {row.name}
            </button>
          ))}
          <div className="mt-1 flex gap-1 border-t border-line pt-2">
            <input
              value={folderDraft}
              onChange={(e) => setFolderDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                createFolder();
              }}
              placeholder="New folder"
              className="h-10 min-w-0 flex-1 rounded-md bg-paper px-2 text-sm outline-none placeholder:text-muted"
            />
            <button
              type="button"
              className="h-10 rounded-md px-2 text-sm text-ink"
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
