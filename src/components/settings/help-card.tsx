import { Card } from "@/components/settings/settings-ui.tsx";

export function HelpCard() {
  return (
    <Card
      id="help"
      title="Help — your first evening with Kami"
      copy="Three steps to a quiet desk. This same guide appears when your desk is empty."
    >
      <ol className="grid gap-3 md:grid-cols-3">
        {[
          [
            "1 · Bind a link",
            "Paste a blog or X URL on Home. Kami keeps a clean, distraction-free copy.",
          ],
          [
            "2 · Ink a passage",
            "Select any passage in the reader. It is pressed into the Highlight Vault as a slip.",
          ],
          [
            "3 · Find it in seconds",
            "Filter the Library, or press ⌘K to jump to works, highlights, and tags.",
          ],
        ].map(([t, c]) => (
          <li key={t} className="rounded-lg bg-bg/60 p-4">
            <p className="font-sans text-sm font-semibold text-ink">{t}</p>
            <p className="mt-1 font-body text-sm leading-relaxed text-ink-muted">{c}</p>
          </li>
        ))}
      </ol>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-bg/60 p-4">
          <p className="font-sans text-sm font-semibold text-ink">Keyboard</p>
          <ul className="mt-1 space-y-1 font-sans text-xs text-ink-muted">
            <li>
              <kbd className="rounded bg-paper-warm px-1.5 py-0.5">⌘/Ctrl K</kbd> — command palette
            </li>
            <li>
              <kbd className="rounded bg-paper-warm px-1.5 py-0.5">G</kbd> then{" "}
              <kbd className="rounded bg-paper-warm px-1.5 py-0.5">H/L/V/S</kbd> — Home / Library /
              Vault / Settings
            </li>
          </ul>
        </div>
        <div className="rounded-lg bg-bg/60 p-4">
          <p className="font-sans text-sm font-semibold text-ink">Capture troubleshooting</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 font-body text-sm text-ink-muted">
            <li>
              Bot wall or login? Use the bookmarklet or Save to KAMI extension on desktop, Share →
              KAMI on Android, or Paste article anywhere.
            </li>
            <li>Truncated import? Try a smaller article section.</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
