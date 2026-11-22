import { Link2Off } from "lucide-react";
import {
  describeAmount,
  useBookLinks,
  useCreateLink,
  useLinkNotices,
  useRemoveLink,
  useSetLinkMode,
} from "@/hooks/use-reading-links.ts";
import { useCompass } from "@/hooks/use-compass.ts";
import type { LinkMode } from "@/lib/api/reading-links";
import { cn } from "@/lib/utils.ts";

const MODES: { mode: Exclude<LinkMode, "off">; label: string; hint: string }[] = [
  { mode: "ask", label: "Ask me", hint: "Offers to count it when you update this book" },
  { mode: "auto", label: "Automatic", hint: "Counts it, with Undo" },
];

/**
 * Lets you choose which Compass habits this book counts toward. Optional:
 * a book with no links never touches a habit, and a habit you tick by hand
 * stays ticked either way.
 */
export function BookHabitLinks({ bookId }: { bookId: string }) {
  const compass = useCompass();
  const links = useBookLinks(bookId);
  const create = useCreateLink(bookId);
  const setMode = useSetLinkMode(bookId);
  const remove = useRemoveLink(bookId);
  const { notices, accept, undo, dismiss } = useLinkNotices(bookId);

  // Only done / not-done habits can take a book for now.
  const habits = (compass.data?.habits ?? []).filter((h) => h.kind === "check");
  if (habits.length === 0) return null;
  const byHabit = new Map((links.data ?? []).map((l) => [l.habitId, l]));

  return (
    <section aria-labelledby={`links-${bookId}`} className="kami-sheet p-4 sm:p-5">
      <h2 id={`links-${bookId}`} className="kami-label text-ink-muted">
        Counts toward
        <span className="ml-2 font-normal tracking-normal normal-case">
          optional, you can always tick a habit yourself
        </span>
      </h2>
      {notices.length > 0 ? (
        <ul role="status" className="mt-3 space-y-2">
          {notices.map(({ kind, event: e }) => (
            <li
              key={`${e.linkId}:${e.day}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper-warm px-3 py-2 font-sans text-sm text-ink"
            >
              <span>
                {kind === "applied"
                  ? `Ticked “${e.habitName}” — ${describeAmount(e)} of ${e.label} today.`
                  : `Count ${describeAmount(e)} of ${e.label} toward “${e.habitName}” today?`}
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => void (kind === "applied" ? undo(e) : accept(e))}
                  className="min-h-8 rounded-lg px-2.5 text-xs font-semibold transition-colors hover:text-hanko focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                >
                  {kind === "applied" ? "Undo" : "Yes"}
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(e)}
                  className="min-h-8 rounded-lg px-2.5 text-xs text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                >
                  {kind === "applied" ? "OK" : "Not now"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-3 space-y-2">
        {habits.map((h) => {
          const link = byHabit.get(h.id);
          return (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-sans text-sm text-ink">{h.name}</span>
              {link ? (
                <span className="flex items-center gap-1">
                  <span
                    role="group"
                    aria-label={`When I update this book, for ${h.name}`}
                    className="flex gap-1"
                  >
                    {MODES.map((m) => (
                      <button
                        key={m.mode}
                        type="button"
                        title={m.hint}
                        aria-pressed={link.mode === m.mode}
                        onClick={() => setMode.mutate({ id: link.id, mode: m.mode })}
                        className={cn(
                          "min-h-8 rounded-lg px-2.5 font-sans text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                          link.mode === m.mode
                            ? "bg-paper-warm font-semibold text-ink"
                            : "text-ink-muted hover:text-ink",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </span>
                  <button
                    type="button"
                    aria-label={`Stop counting this book toward ${h.name}`}
                    title="Unlink (days already counted stay)"
                    onClick={() => remove.mutate(link.id)}
                    className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                  >
                    <Link2Off className="size-4" aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={create.isPending}
                  onClick={() =>
                    create.mutate({ sourceType: "book", sourceId: bookId, habitId: h.id })
                  }
                  className="min-h-8 rounded-lg px-2.5 font-sans text-xs text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                >
                  Link
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
