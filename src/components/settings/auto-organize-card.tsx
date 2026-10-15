import { useState } from "react";
import { toast } from "sonner";
import { useAiStatus, organizeLibrary } from "@/hooks/use-ai.ts";
import { useLibraryStore } from "@/lib/store.ts";
import { Card, ExportButton } from "@/components/settings/settings-ui.tsx";

/** Waiting articles: no tags, no folder (link-only stubs can't be read, so they're skipped). */
export function AutoOrganizeCard() {
  const ai = useAiStatus();
  const autoOrganize = useLibraryStore((s) => s.autoOrganize);
  const setAutoOrganize = useLibraryStore((s) => s.setAutoOrganize);
  const waiting = useLibraryStore(
    (s) => s.library.filter((r) => !r.tags?.length && !r.folderId).length,
  );
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState<number | null>(null);

  if (!ai.enabled) return null;

  async function run() {
    setRunning(true);
    setLeft(null);
    try {
      const filed = await organizeLibrary((remaining) => setLeft(remaining));
      toast.success(
        filed > 0 ? `Filed ${filed} ${filed === 1 ? "work" : "works"}` : "Nothing new to file",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not organize the library.");
    } finally {
      setRunning(false);
      setLeft(null);
    }
  }

  return (
    <Card
      id="auto-organize"
      title="Auto-organize with AI"
      copy="Adds a few tags and, when one fits, a folder to articles that have neither. Your own tags and folders are never changed."
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={autoOrganize}
          onChange={(e) => setAutoOrganize(e.target.checked)}
          className="mt-1 size-4 accent-[#a6331b]"
        />
        <span>
          <span className="font-sans text-sm font-medium text-ink">
            Organize new articles automatically
          </span>
          <span className="block font-body text-sm text-ink-muted">
            Runs when you save something and whenever the library opens. Articles saved from the
            extension are picked up on your next visit.
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <ExportButton onClick={() => void run()}>
          {running ? "Organizing…" : "Organize existing articles"}
        </ExportButton>
        <span className="font-sans text-xs text-ink-muted tabular-nums">
          {running && left !== null ? `${left} left` : `${waiting} untagged & unfiled`}
        </span>
      </div>
    </Card>
  );
}
