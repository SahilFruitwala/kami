import { useLibraryStore } from "@/lib/store.ts";
import { Card } from "@/components/settings/settings-ui.tsx";

export function ReadingCard() {
  const resumeEnabled = useLibraryStore((s) => s.resumeEnabled);
  const setResumeEnabled = useLibraryStore((s) => s.setResumeEnabled);

  return (
    <Card id="reading" title="Reading" copy="Scroll-resume behavior in the reader.">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={resumeEnabled}
          onChange={(e) => setResumeEnabled(e.target.checked)}
          className="mt-1 size-4 accent-[#a6331b]"
        />
        <span>
          <span className="font-sans text-sm font-medium text-ink">
            Offer scroll-resume in the reader
          </span>
          <span className="block font-body text-sm text-ink-muted">
            When reopening a work past 8%, show a Resume / Start over pill. Progress is stored
            on-device only.
          </span>
        </span>
      </label>
    </Card>
  );
}
