import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Clapperboard, House, LibraryBig, NotebookPen, Settings, Vault } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command.tsx";
import { useLibraryStore, type LibraryItem } from "@/lib/store.ts";

/** Global ⌘K palette: jump between panes or open a bound work. */
export function CommandPalette({
  onOpenItem,
}: {
  onOpenItem: (item: LibraryItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const library = useLibraryStore((s) => s.library);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function go(to: "/" | "/library" | "/journal" | "/shelves" | "/vault" | "/settings") {
    setOpen(false);
    void navigate({ to });
  }

  function openWork(item: LibraryItem) {
    setOpen(false);
    onOpenItem(item);
  }

  const works = [...library]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 60);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search works, jump to a pane…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Go to">
          <CommandItem value="go home" onSelect={() => go("/")}>
            <House aria-hidden="true" />
            Home
            <CommandShortcut>G H</CommandShortcut>
          </CommandItem>
          <CommandItem value="go library" onSelect={() => go("/library")}>
            <LibraryBig aria-hidden="true" />
            Library
            <CommandShortcut>G L</CommandShortcut>
          </CommandItem>
          <CommandItem value="go journal" onSelect={() => go("/journal")}>
            <NotebookPen aria-hidden="true" />
            Journal
            <CommandShortcut>G J</CommandShortcut>
          </CommandItem>
          <CommandItem value="go shelves movies tv books wishlist" onSelect={() => go("/shelves")}>
            <Clapperboard aria-hidden="true" />
            Shelves
            <CommandShortcut>G M</CommandShortcut>
          </CommandItem>
          <CommandItem value="go vault highlights" onSelect={() => go("/vault")}>
            <Vault aria-hidden="true" />
            Vault
            <CommandShortcut>G V</CommandShortcut>
          </CommandItem>
          <CommandItem value="go settings preferences" onSelect={() => go("/settings")}>
            <Settings aria-hidden="true" />
            Settings
            <CommandShortcut>G S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Works">
          {works.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.title} ${item.author ?? ""} ${item.siteName ?? ""} ${item.url} ${(item.tags ?? []).join(" ")} ${item.note ?? ""} ${(item.highlights ?? []).map((h) => `${h.text} ${h.note}`).join(" ")}`}
              keywords={[...(item.tags ?? []), item.author ?? "", item.siteName ?? ""]}
              onSelect={() => openWork(item)}
            >
              <BookOpen aria-hidden="true" />
              <span className="truncate">{item.title}</span>
              {item.highlights?.length ? (
                <CommandShortcut>{item.highlights.length} inked</CommandShortcut>
              ) : item.readingMinutes ? (
                <CommandShortcut>{item.readingMinutes} min</CommandShortcut>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
