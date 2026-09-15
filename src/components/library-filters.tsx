import { useMemo, useState, type ReactNode } from "react";
import { FolderPlus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { collectLibraryTags } from "@/lib/filter-library.ts";
import { useLibraryStore } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

export function LibraryFilters({
  folderFilter,
  tagFilter,
  favoritesOnly,
  onFolder,
  onTag,
  onFavoritesOnly,
}: {
  folderFilter: string | "all" | "none";
  tagFilter: string | null;
  query: string;
  favoritesOnly: boolean;
  onFolder: (value: string | "all" | "none") => void;
  onTag: (tag: string | null) => void;
  onQuery: (value: string) => void;
  onFavoritesOnly: (value: boolean) => void;
}) {
  const folders = useLibraryStore((s) => s.folders);
  const library = useLibraryStore((s) => s.library);
  const addFolder = useLibraryStore((s) => s.addFolder);
  const removeFolder = useLibraryStore((s) => s.removeFolder);
  const tags = useMemo(() => collectLibraryTags(library), [library]);
  const [draft, setDraft] = useState("");

  function createFolder() {
    const id = addFolder(draft);
    setDraft("");
    if (id) onFolder(id);
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Quick filters">
      <FilterChip active={favoritesOnly} onClick={() => onFavoritesOnly(!favoritesOnly)}>
        <Star className={cn("size-3.5", favoritesOnly && "fill-current")} aria-hidden="true" />
        Favorites
      </FilterChip>
      <FilterChip active={folderFilter === "none"} onClick={() => onFolder("all")}>
        All slipcases
      </FilterChip>
      {folders.map((folder) => (
        <span key={folder.id} className="inline-flex items-center">
          <FilterChip active={folderFilter === folder.id} onClick={() => onFolder(folder.id)}>
            {folder.name}
          </FilterChip>
          <button
            type="button"
            className="ml-1 flex size-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-paper-warm hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
            aria-label={`Delete folder ${folder.name}`}
            onClick={() => {
              if (folderFilter === folder.id) onFolder("all");
              removeFolder(folder.id);
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      {tags.slice(0, 8).map((tag) => (
        <FilterChip
          key={tag}
          active={tagFilter === tag}
          onClick={() => onTag(tagFilter === tag ? null : tag)}
        >
          #{tag}
        </FilterChip>
      ))}
      <span className="inline-flex items-center gap-1">
        <label htmlFor="new-folder" className="sr-only">
          New folder name
        </label>
        <Input
          id="new-folder"
          name="new-folder"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            createFolder();
          }}
          placeholder="New slipcase…"
          autoComplete="off"
          className="h-9 w-32 bg-surface"
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-9 text-ink-soft hover:text-hanko"
          aria-label="Create folder"
          onClick={createFolder}
        >
          <FolderPlus className="size-4" aria-hidden="true" />
        </Button>
      </span>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[0.25rem] px-3 font-sans text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
        active
          ? "bg-hanko font-semibold text-white shadow-sm"
          : "bg-paper-warm text-ink-soft hover:bg-line hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
