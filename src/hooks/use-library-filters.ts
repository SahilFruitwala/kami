import { useState } from "react";
import type { FolderFilter, LibraryTab } from "@/lib/filter-library.ts";

export function useLibraryFilters() {
  const [tab, setTab] = useState<LibraryTab>("inbox");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  return {
    tab,
    setTab,
    folderFilter,
    setFolderFilter,
    tagFilter,
    setTagFilter,
    query,
    setQuery,
    favoritesOnly,
    setFavoritesOnly,
  };
}
