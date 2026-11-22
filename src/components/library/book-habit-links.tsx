import { Link2Off } from "lucide-react";
import {
  describeNotice,
  useBookLinks,
  useCreateLink,
  useLinkNotices,
  useLinkSuggestions,
  useRemoveLink,
  useSetLinkMode,
} from "@/hooks/use-reading-links.ts";
import { useCompass } from "@/hooks/use-compass.ts";
import type { LinkMode, ReadingLink } from "@/lib/api/reading-links";
import { cn } from "@/lib/utils.ts";

const MODES: { mode: Exclude<LinkMode, "off">; label: string; hint: string }[] = [
  { mode: "ask", label: "Ask me", hint: "Offers to count it when you update this book" },
  { mode: "auto", label: "Automatic", hint: "Counts it, with Undo" },
];

const quiet =
  "min-h-8 rounded-lg px-2.5 font-sans text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40";

/** One thing this book can count toward: a habit, or a milestone. */
function TargetRow({
  label,
  sub,
  link,
  linking,
  onLink,
  onMode,
  onUnlink,
}: {
  label: string;
  sub?: string;
  link: ReadingLink | undefined;
  linking: boolean;
  onLink: () => void;
  onMode: (mode: LinkMode) => void;
  onUnlink: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 font-sans text-sm text-ink">
        {label}
        {sub ? <span className="ml-2 text-xs text-ink-muted">{sub}</span> : null}
      </span>
      {link ? (
        <span className="flex items-center gap-1">
          <span
            role="group"
            aria-label={`When I update this book, for ${label}`}
            className="flex gap-1"
          >
            {MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                title={m.hint}
                aria-pressed={link.mode === m.mode}
                onClick={() => onMode(m.mode)}
                className={cn(
                  quiet,
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
            aria-label={`Stop counting this book toward ${label}`}
            title="Unlink (days already counted stay)"
            onClick={onUnlink}
            className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
          >
            <Link2Off className="size-4" aria-hidden="true" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={linking}
          onClick={onLink}
          className={cn(quiet, "text-ink-muted hover:text-ink")}
        >
          Link
        </button>
      )}
    </li>
  );
}

/**
 * Lets you choose which Compass habits and milestones this book counts toward.
 * Optional: a book with no links never touches anything, and a habit you tick
 * by hand stays ticked either way.
 */
export function BookHabitLinks({ bookId }: { bookId: string }) {
  const compass = useCompass();
  const links = useBookLinks(bookId);
  const create = useCreateLink();
  const setMode = useSetLinkMode();
  const remove = useRemoveLink();
  const { notices, accept, undo, dismiss } = useLinkNotices(bookId);
  const offers = useLinkSuggestions(bookId);

  // Only done / not-done habits can take a book for now, and only unfinished milestones.
  const habits = (compass.data?.habits ?? []).filter((h) => h.kind === "check");
  const milestones = (compass.data?.goals ?? []).flatMap((g) =>
    g.milestones.filter((m) => !m.done).map((m) => ({ id: m.id, title: m.title, goal: g.name })),
  );
  if (habits.length === 0 && milestones.length === 0) return null;
  const byTarget = new Map((links.data ?? []).map((l) => [`${l.targetType}:${l.targetId}`, l]));

  const rowFor = (
    targetType: "habit" | "milestone",
    targetId: string,
    label: string,
    sub?: string,
  ) => {
    const link = byTarget.get(`${targetType}:${targetId}`);
    return (
      <TargetRow
        key={`${targetType}:${targetId}`}
        label={label}
        sub={sub}
        link={link}
        linking={create.isPending}
        onLink={() => create.mutate({ sourceType: "book", sourceId: bookId, targetType, targetId })}
        onMode={(mode) => link && setMode.mutate({ id: link.id, mode })}
        onUnlink={() => link && remove.mutate(link.id)}
      />
    );
  };

  const pill =
    "flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper-warm px-3 py-2 font-sans text-sm text-ink";

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
          {notices.map((n) => (
            <li
              key={
                n.event.kind === "habit"
                  ? `${n.event.linkId}:${n.event.day}`
                  : `${n.event.linkId}:m`
              }
              className={pill}
            >
              <span>{describeNotice(n)}</span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => void (n.kind === "applied" ? undo(n.event) : accept(n.event))}
                  className={cn(quiet, "font-semibold hover:text-hanko")}
                >
                  {n.kind === "applied" ? "Undo" : "Yes"}
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(n.event)}
                  className={cn(quiet, "text-ink-muted hover:text-ink")}
                >
                  {n.kind === "applied" ? "OK" : "Not now"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {offers.suggestions.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {offers.suggestions.map((s) => (
            <li key={s.habitId} className={pill}>
              <span>
                Count this toward “{s.habitName}”, like <i>{s.fromTitle}</i>?
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  disabled={create.isPending}
                  onClick={() =>
                    create.mutate({
                      sourceType: "book",
                      sourceId: bookId,
                      targetType: "habit",
                      targetId: s.habitId,
                      mode: s.mode,
                    })
                  }
                  className={cn(quiet, "font-semibold hover:text-hanko")}
                >
                  Link
                </button>
                <button
                  type="button"
                  onClick={() => offers.dismiss(s.habitId)}
                  className={cn(quiet, "text-ink-muted hover:text-ink")}
                >
                  Not now
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {habits.length > 0 ? (
        <ul className="mt-3 space-y-2">{habits.map((h) => rowFor("habit", h.id, h.name))}</ul>
      ) : null}
      {milestones.length > 0 ? (
        <>
          <h3 className="kami-label mt-4 text-ink-muted">
            Milestones
            <span className="ml-2 font-normal tracking-normal normal-case">
              marked done when you finish this book
            </span>
          </h3>
          <ul className="mt-2 space-y-2">
            {milestones.map((m) => rowFor("milestone", m.id, m.title, m.goal))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
