import { ToolsDialog } from "@/components/library/library-dialogs.tsx";
import { useCaptureTools } from "@/hooks/use-capture-tools.ts";
import { Card } from "@/components/settings/settings-ui.tsx";

export function CaptureCard() {
  const tools = useCaptureTools();
  return (
    <Card id="capture" title="Capture" copy="Blocked pages? Capture in your browser, then import. Bookmarklets need a desktop bookmark bar — on mobile use Paste article.">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => tools.setToolsOpen(true)} className="rounded-[0.25rem] bg-hanko px-5 py-2.5 font-sans text-sm font-semibold text-white shadow-sm hover:bg-shu">
          Open capture tools
        </button>
        <a href="#help" className="rounded-[0.25rem] bg-paper-warm px-5 py-2.5 font-sans text-sm font-medium text-ink hover:bg-line">
          How capturing works →
        </a>
      </div>
      <ToolsDialog open={tools.toolsOpen} onOpenChange={tools.setToolsOpen} bookmarklet={tools.bookmarklet} />
    </Card>
  );
}
