import { useLibraryStore } from "@/lib/store.ts";
import { RATES } from "@/hooks/use-reader-tts.ts";
import { Card } from "@/components/settings/settings-ui.tsx";

export function ReadingCard() {
  const ttsRate = useLibraryStore((s) => s.ttsRate);
  const setTtsRate = useLibraryStore((s) => s.setTtsRate);
  const resumeEnabled = useLibraryStore((s) => s.resumeEnabled);
  const setResumeEnabled = useLibraryStore((s) => s.setResumeEnabled);

  return (
    <Card id="reading" title="Reading & audio" copy="Listen speed and scroll-resume. Voice pick stays in the reader where voices can be previewed.">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="settings-tts-rate" className="font-sans text-sm font-medium text-ink">Listen speed</label>
        <select
          id="settings-tts-rate"
          value={String(ttsRate)}
          onChange={(e) => setTtsRate(Number(e.target.value))}
          className="h-10 rounded-lg bg-surface px-2 text-sm font-medium text-ink shadow-[var(--shadow-border)]"
        >
          {RATES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={resumeEnabled} onChange={(e) => setResumeEnabled(e.target.checked)} className="mt-1 size-4 accent-[#a6331b]" />
        <span>
          <span className="font-sans text-sm font-medium text-ink">Offer scroll-resume in the reader</span>
          <span className="block font-body text-sm text-ink-muted">When reopening a work past 8%, show a Resume / Start over pill. Progress is stored on-device only.</span>
        </span>
      </label>
    </Card>
  );
}
