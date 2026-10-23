import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLibraryStore } from "@/lib/store.ts";
import {
  downloadBlob,
  findDuplicateGroups,
  linkOnlyItem,
  parseLibraryJson,
  parseOPML,
  toLibraryJson,
  toOPML,
  toVaultCsv,
} from "@/lib/export.ts";
import { wipeLibraryAccount } from "@/lib/library-remote.ts";
import { libraryApi } from "@/lib/api/library";
import { parseBookCsv } from "@/lib/goodreads.ts";
import { Card, ExportButton, FieldLabel, MiniButton } from "@/components/settings/settings-ui.tsx";
import { toastError } from "@/lib/errors";
import { confirmAction } from "@/lib/confirm.ts";
import { useImportBooks } from "@/hooks/use-shelf-queries.ts";

export function DataCard() {
  const library = useLibraryStore((s) => s.library);
  const folders = useLibraryStore((s) => s.folders);
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const mergeItems = useLibraryStore((s) => s.mergeItems);
  const clearLibrary = useLibraryStore((s) => s.clearLibrary);
  const fileRef = useRef<HTMLInputElement>(null);
  const goodreadsRef = useRef<HTMLInputElement>(null);
  const importBooks = useImportBooks();
  const [goodreadsBusy, setGoodreadsBusy] = useState(false);

  const dupes = useMemo(() => findDuplicateGroups(library), [library]);
  const slipCount = useMemo(
    () => library.reduce((n, row) => n + (row.highlights?.length ?? 0), 0),
    [library],
  );

  function exportOpml() {
    downloadBlob(new Blob([toOPML(library)], { type: "text/xml" }), "kami-library.opml");
    toast.success("Library exported as OPML");
  }

  function exportVaultCsv() {
    downloadBlob(new Blob([toVaultCsv(library)], { type: "text/csv" }), "highlight-vault.csv");
    toast.success("Vault exported as CSV");
  }

  async function exportJson() {
    try {
      // Boot omits article bodies — pull a full snapshot for a faithful export.
      const snapshot = await libraryApi.export();
      downloadBlob(
        new Blob([toLibraryJson(snapshot.library, snapshot.folders)], {
          type: "application/json",
        }),
        "kami-library.json",
      );
      toast.success("Library exported as JSON");
    } catch {
      toast.error("Could not export library. Try again.");
    }
  }

  async function importFile(file: File) {
    const text = await file.text();
    try {
      if (/\.opml$|\.xml$/i.test(file.name) || text.trimStart().startsWith("<")) {
        const links = parseOPML(text);
        if (links.length === 0) {
          toast.error("No feeds found in that OPML file.");
          return;
        }
        const existing = new Set(library.map((row) => row.url));
        let added = 0;
        for (const link of links) {
          if (existing.has(link.url)) continue;
          upsertItem(linkOnlyItem(link.url, link.title));
          added += 1;
        }
        toast.success(`Imported ${added} works (${links.length - added} already bound)`);
      } else {
        const { library: rows, folders: incomingFolders } = parseLibraryJson(text);
        const addFolder = useLibraryStore.getState().addFolder;
        for (const f of incomingFolders) {
          if (!folders.some((x) => x.id === f.id)) addFolder(f.name);
        }
        for (const row of rows) upsertItem(row);
        toast.success(`Imported ${rows.length} works from JSON`);
      }
    } catch (err) {
      toastError(err, "Could not read that file.");
    }
  }

  async function importGoodreads(file: File) {
    setGoodreadsBusy(true);
    try {
      const { source, books } = parseBookCsv(await file.text());
      const from = source === "storygraph" ? "StoryGraph" : "Goodreads";
      if (books.length === 0) {
        toast.error(`No books found in that ${from} export.`);
        return;
      }
      const { imported, skipped } = await importBooks.mutateAsync({ source, books });
      toast.success(
        `Shelved ${imported} ${imported === 1 ? "book" : "books"} from ${from}` +
          (skipped ? ` (${skipped} already on your shelf)` : ""),
      );
    } catch (err) {
      toastError(err, "Could not import that file.");
    } finally {
      setGoodreadsBusy(false);
    }
  }

  return (
    <Card
      id="data"
      title="Data — export, import & account"
      copy="Your library, your file. Exports download immediately; imports merge by URL so nothing duplicates."
    >
      <div className="flex flex-wrap gap-2">
        <ExportButton onClick={exportJson}>Library JSON</ExportButton>
        <ExportButton onClick={exportOpml}>OPML (RSS readers)</ExportButton>
        <ExportButton onClick={exportVaultCsv}>Vault CSV ({slipCount} slips)</ExportButton>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-lg bg-paper-warm px-4 py-2 font-sans text-xs font-medium text-ink hover:bg-line"
        >
          Import JSON / OPML…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.opml,.xml,application/json,text/xml"
          className="hidden"
          aria-label="Import library file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={goodreadsBusy}
          onClick={() => goodreadsRef.current?.click()}
          className="rounded-lg bg-paper-warm px-4 py-2 font-sans text-xs font-medium text-ink hover:bg-line disabled:opacity-60"
        >
          {goodreadsBusy ? "Importing books…" : "Import Goodreads / StoryGraph CSV…"}
        </button>
        <input
          ref={goodreadsRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label="Import Goodreads or StoryGraph library export"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importGoodreads(file);
            e.target.value = "";
          }}
        />
      </div>
      <p className="font-body text-xs text-ink-muted">
        Goodreads: My Books → Import and export → Export library. StoryGraph: Manage Account →
        Export StoryGraph Library. Read, currently reading and want-to-read land on your Book shelf
        with ratings, reviews and dates; books already there are skipped.
      </p>

      <div>
        <FieldLabel>Possible duplicates ({dupes.length})</FieldLabel>
        {dupes.length === 0 ? (
          <p className="mt-2 rounded-lg bg-bg/60 px-3 py-2.5 font-body text-sm text-ink-muted italic">
            No duplicates detected — URLs and titles all look distinct.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {dupes.slice(0, 10).map((group, i) => (
              <li key={group.map((g) => g.id).join("|")} className="rounded-lg bg-bg/60 p-3">
                <p className="font-sans text-xs font-semibold text-ink">
                  {group.length} copies of “{group[0]!.title.slice(0, 60)}”
                </p>
                <ul className="mt-1 space-y-0.5">
                  {group.map((row) => (
                    <li key={row.id} className="truncate font-body text-xs text-ink-muted">
                      {new Date(row.savedAt).toLocaleDateString()}, {row.highlights.length}{" "}
                      highlights, {row.url}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <MiniButton
                    onClick={() => {
                      const [keep, ...rest] = [...group].sort((a, b) => a.savedAt - b.savedAt);
                      for (const drop of rest) mergeItems(keep!.id, drop.id);
                      toast.success(
                        `Merged ${rest.length} ${rest.length === 1 ? "copy" : "copies"} — tags and highlights kept`,
                      );
                    }}
                  >
                    Merge (keep oldest)
                  </MiniButton>
                  <span className="font-sans text-[11px] text-ink-muted">
                    or open each work from the Library to keep both.
                  </span>
                </div>
                {i === 9 && dupes.length > 10 ? (
                  <p className="mt-1 font-sans text-[11px] text-ink-muted">
                    …and {dupes.length - 10} more groups.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
        <p className="font-sans text-sm font-semibold text-danger">Danger zone</p>
        <p className="mt-1 font-body text-sm text-ink-muted">
          Export first — this deletes every work, folder, and highlight from this device{" "}
          <em>and</em> your account on the server.
        </p>
        <button
          type="button"
          onClick={async () => {
            const first = await confirmAction({
              title: "Delete your entire library?",
              description: "This cannot be undone. Export first.",
              confirmLabel: "Continue",
            });
            if (!first) return;
            const last = await confirmAction({
              title: "Really delete everything?",
              description: "This includes the server copy. Last chance.",
              confirmLabel: "Delete everything",
            });
            if (!last) return;
            void (async () => {
              try {
                await wipeLibraryAccount();
                toast.success("Library deleted everywhere");
              } catch {
                clearLibrary();
                toast.error(
                  "Server unreachable — cleared this device only. Try again online to finish.",
                );
              }
            })();
          }}
          className="mt-3 rounded-lg bg-danger px-4 py-2 font-sans text-xs font-semibold text-white hover:brightness-110"
        >
          Delete all library data
        </button>
      </div>
    </Card>
  );
}
