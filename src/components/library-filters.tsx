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
  query,
  favoritesOnly,
  onFolder,
  onTag,
  onQuery,
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
    <div className="mt-6 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="library-search" className="sr-only">
          Search your library
        </label>
        <Input
          id="library-search"
          name="q"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search title, tags, notes…"
          className="h-11 sm:flex-1"
        />
        <Button
          type="button"
          variant={favoritesOnly ? "default" : "secondary"}
          className="h-11 gap-2"
          aria-pressed={favoritesOnly}
          onClick={() => onFavoritesOnly(!favoritesOnly)}
        >
          <Star className={cn("size-4", favoritesOnly && "fill-current")} aria-hidden="true" />
          Favorites
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={folderFilter === "all"} onClick={() => onFolder("all")}>
          All
        </FilterChip>
        <FilterChip active={folderFilter === "none"} onClick={() => onFolder("none")}>
          Unfiled
        </FilterChip>
        {folders.map((folder) => (
          <span key={folder.id} className="inline-flex items-center">
            <FilterChip active={folderFilter === folder.id} onClick={() => onFolder(folder.id)}>
              {folder.name}
            </FilterChip>
            <button
              type="button"
              className="ml-0.5 size-8 rounded-full text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
              aria-label={`Delete folder ${folder.name}`}
              onClick={() => {
                if (folderFilter === folder.id) onFolder("all");
                removeFolder(folder.id);
              }}
            >
              <X className="mx-auto size-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
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
          placeholder="New folder…"
          autoComplete="off"
          className="h-11 w-36"
        />
        <Button variant="ghost" size="icon" aria-label="Create folder" onClick={createFolder}>
          <FolderPlus className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {tags.map((tag) => (
            <FilterChip
              key={tag}
              active={tagFilter === tag}
              onClick={() => onTag(tagFilter === tag ? null : tag)}
            >
              {tag}
            </FilterChip>
          ))}
        </div>
      ) : null}
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
        "h-11 rounded-full px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30",
        active ? "bg-ink text-paper" : "bg-paper-warm text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
