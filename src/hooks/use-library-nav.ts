import { addTransitionType, startTransition, useEffect } from "react";
import { useLibraryStore } from "@/lib/store.ts";

type HomeSearch = {
  id?: string;
  import?: string;
};

type NavigateFn = (opts: {
  search: (prev: HomeSearch) => HomeSearch;
  replace?: boolean;
}) => unknown;

/**
 * Keeps URL search `id` and store `openId` in sync, and tags navigations
 * so <DirectionalTransition> can slide list ↔ reader.
 */
export function useLibraryNav(
  navigate: NavigateFn,
  searchId: string | undefined,
) {
  const openId = useLibraryStore((s) => s.openId);
  const setOpenId = useLibraryStore((s) => s.setOpenId);

  function goOpen(id: string | null, replace = false) {
    startTransition(() => {
      addTransitionType(id ? "nav-forward" : "nav-back");
      setOpenId(id);
      void navigate({
        search: (prev) => {
          const next: HomeSearch = { ...prev };
          if (id) next.id = id;
          else delete next.id;
          return next;
        },
        replace,
      });
    });
  }

  // Address bar is the source of truth for which article is open.
  useEffect(() => {
    const fromUrl = searchId ?? null;
    if (fromUrl === openId) return;
    startTransition(() => {
      addTransitionType(fromUrl ? "nav-forward" : "nav-back");
      setOpenId(fromUrl);
    });
  }, [searchId, openId, setOpenId]);

  return { openId, goOpen };
}
