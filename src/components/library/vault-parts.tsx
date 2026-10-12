import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Copy,
  Droplets,
  Heart,
  LoaderCircle,
  PenLine,
  Sparkles,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Hanko } from "@/components/kami.tsx";
import { useAiStatus } from "@/hooks/use-ai.ts";
import { aiApi } from "@/lib/api/ai";
import { HIGHLIGHT_NOTE_MAX } from "@/lib/item-ops.ts";
import type { Highlight, LibraryItem } from "@/lib/store.ts";
import { useLibraryStore } from "@/lib/store.ts";
import { cn } from "@/lib/utils.ts";

export type Slip = { item: LibraryItem; highlight: Highlight };
export type VaultViewMode = "tanzaku" | "river" | "web";
export type VaultSort = "recent" | "linked" | "source";

export function MetricDot({
  color,
  label,
  strong,
}: {
  color: string;
  label: string;
  strong?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 shadow-[var(--shadow-border)]">
      <span className={cn("size-1.5 rounded-full", color)} aria-hidden="true" />
      <span
        className={cn("font-sans text-xs", strong ? "font-semibold text-ink" : "text-ink-soft")}
      >
        {label}
      </span>
    </span>
  );
}

export function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1 font-sans text-xs transition-colors",
        active ? "bg-surface text-hanko shadow-sm" : "text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded px-2.5 py-1 font-sans text-[11px] whitespace-nowrap transition-colors",
        active ? "bg-paper-warm text-ink" : "text-ink-soft hover:bg-paper-warm",
      )}
    >
      {children}
    </button>
  );
}

export function SlipCard({
  slip,
  onOpenItem,
}: {
  slip: Slip;
  onOpenItem: (item: LibraryItem) => void;
}) {
  const { item, highlight } = slip;
  const setFavorited = useLibraryStore((s) => s.setFavorited);
  const setHighlightNote = useLibraryStore((s) => s.setHighlightNote);
  const removeHighlight = useLibraryStore((s) => s.removeHighlight);
  const restoreHighlight = useLibraryStore((s) => s.restoreHighlight);
  const favorited = item.favorited;
  const [editingNote, setEditingNote] = useState(false);
  const ai = useAiStatus();
  /** An AI-drafted note, opened in the editor for the reader to keep or change. */
  const [draft, setDraft] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  async function draftNote() {
    if (drafting) return;
    setDrafting(true);
    try {
      const { note } = await aiApi.draftNote(item.id, highlight.text.slice(0, 1500));
      setDraft(note);
      setEditingNote(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not draft a note.");
    } finally {
      setDrafting(false);
    }
  }

  function saveNote(next: string) {
    const trimmed = next.trim();
    setEditingNote(false);
    setDraft(null);
    if (trimmed === highlight.note) return;
    setHighlightNote(item.id, highlight.id, trimmed);
    if (!trimmed && highlight.note) {
      const previous = highlight.note;
      toast.success("Note deleted", {
        action: { label: "Undo", onClick: () => setHighlightNote(item.id, highlight.id, previous) },
      });
    } else {
      toast.success(highlight.note ? "Note updated" : "Note added");
    }
  }

  function deleteNote() {
    setEditingNote(false);
    saveNote("");
  }

  function deleteSlip() {
    const snapshot = highlight;
    removeHighlight(item.id, snapshot.id);
    toast.success("Highlight deleted", {
      description: snapshot.note ? "Its note was removed with it." : undefined,
      action: { label: "Undo", onClick: () => restoreHighlight(item.id, snapshot) },
    });
  }

  async function copyText(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <article className="kami-sheet group relative flex break-inside-avoid flex-col justify-between p-6 transition-shadow hover:shadow-[var(--shadow-border-hover)]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="kami-label text-ink-muted">
            Inked{" "}
            {new Date(highlight.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
          <Hanko
            glyph={(item.author || item.siteName || "K").trim().charAt(0) || "K"}
            square
            className="size-7 text-[11px]"
          />
        </div>
        <blockquote className="font-display text-lg leading-snug font-normal break-words text-ink italic">
          “{highlight.text}”
        </blockquote>
        <div>
          <p className="font-sans text-sm font-medium text-ok">
            — {item.author || item.siteName || "Unknown hand"},{" "}
            <span className="font-normal italic">{item.title}</span>
          </p>
        </div>
        {editingNote ? (
          <NoteEditor
            initial={draft ?? highlight.note}
            onSave={saveNote}
            onCancel={() => {
              setEditingNote(false);
              setDraft(null);
            }}
            onDelete={highlight.note ? deleteNote : undefined}
          />
        ) : highlight.note ? (
          <div className="group/note flex items-start gap-2.5 rounded-md bg-bg/70 px-3 py-2.5">
            <PenLine className="mt-0.5 size-[18px] shrink-0 text-hanko" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="kami-label text-ink-muted">Personal Marginalia</p>
                <span className="flex items-center gap-2 opacity-100 transition-opacity md:opacity-0 md:group-focus-within/note:opacity-100 md:group-hover/note:opacity-100">
                  <button
                    type="button"
                    onClick={() => setEditingNote(true)}
                    className="font-sans text-[11px] text-ink-accent underline-offset-2 hover:text-hanko hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={deleteNote}
                    className="font-sans text-[11px] text-ink-muted underline-offset-2 hover:text-hanko hover:underline"
                  >
                    Delete
                  </button>
                </span>
              </div>
              <p className="font-body text-sm break-words whitespace-pre-wrap text-ink italic">
                {highlight.note}
              </p>
            </div>
          </div>
        ) : null}
        {(item.tags ?? []).length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {(item.tags ?? []).slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded bg-shu-tint px-2 py-0.5 font-sans text-[11px] text-hanko"
              >
                #{t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="-mx-6 -mb-6 mt-5 flex items-center justify-between rounded-b-[0.25rem] bg-bg/60 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <SlipAction onClick={() => void copyText(highlight.text, "Passage copied")}>
            <Copy className="size-4" aria-hidden="true" />
            Copy
          </SlipAction>
          <SlipAction onClick={() => onOpenItem(item)}>
            <BookOpen className="size-4" aria-hidden="true" />
            Read
          </SlipAction>
          <SlipAction
            onClick={() =>
              void copyText(
                `“${highlight.text}” — ${item.author || item.siteName || "Unknown"}, ${item.title}`,
                "Citation copied for your journal",
              )
            }
          >
            <PenLine className="size-4" aria-hidden="true" />
            Cite
          </SlipAction>
          {!highlight.note && !editingNote ? (
            <SlipAction onClick={() => setEditingNote(true)}>
              <StickyNote className="size-4" aria-hidden="true" />
              Note
            </SlipAction>
          ) : null}
          {ai.enabled && !highlight.note && !editingNote ? (
            <SlipAction onClick={() => void draftNote()}>
              {drafting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-4" aria-hidden="true" />
              )}
              Draft
            </SlipAction>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={deleteSlip}
            aria-label="Delete highlight"
            title="Delete highlight"
            className="text-ink-muted transition-colors hover:text-hanko"
          >
            <Trash2 className="size-[17px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              setFavorited(item.id, !favorited);
              toast.success(favorited ? "Removed from Favorites" : "Added to Favorites");
            }}
            aria-pressed={favorited}
            aria-label={favorited ? "Remove from Favorites" : "Add to Favorites"}
            title={favorited ? "Remove from Favorites" : "Add to Favorites"}
            className={cn(
              "transition-transform hover:scale-110",
              favorited ? "text-hanko" : "text-ink-muted hover:text-hanko",
            )}
          >
            <Heart className={cn("size-[18px]", favorited && "fill-hanko")} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

/** Inline marginalia editor — ⌘/Ctrl+Enter saves, Escape cancels. */
export function NoteEditor({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: string;
  onSave: (note: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [draft]);

  return (
    <form
      className="space-y-2 rounded-md bg-bg/70 px-3 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <label className="kami-label block text-ink-muted">
        Personal Marginalia
        <textarea
          ref={ref}
          value={draft}
          maxLength={HIGHLIGHT_NOTE_MAX}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSave(draft);
            }
          }}
          placeholder="Why did this passage matter?"
          className="mt-1.5 block w-full resize-none rounded-lg border border-line bg-surface px-2.5 py-2 font-body text-sm tracking-normal text-ink normal-case outline-none placeholder:text-ink-muted placeholder:italic focus-visible:ring-2 focus-visible:ring-hanko/30"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-[10px] tabular-nums text-ink-muted">
          {draft.length}/{HIGHLIGHT_NOTE_MAX}
        </span>
        <span className="flex items-center gap-2">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="rounded px-2 py-1 font-sans text-[11px] text-ink-muted hover:text-hanko"
            >
              Delete note
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-2 py-1 font-sans text-[11px] text-ink-soft hover:bg-paper-warm"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-hanko px-2.5 py-1 font-sans text-[11px] font-medium text-paper shadow-sm hover:bg-shu"
          >
            Save
          </button>
        </span>
      </div>
    </form>
  );
}

function SlipAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 font-sans text-[11px] text-ink-accent transition-colors hover:text-hanko"
    >
      {children}
    </button>
  );
}

function weekdayLabel(daysAgo: number): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
    new Date(Date.now() - daysAgo * 86_400_000),
  );
}

export function InkSparkline({ slips }: { slips: Slip[] }) {
  const bins = useMemo(() => {
    const counts = new Array(7).fill(0) as number[];
    const now = new Date();
    for (const { highlight } of slips) {
      const d = Math.floor((now.getTime() - highlight.createdAt) / 86_400_000);
      if (d >= 0 && d < 7) counts[6 - d] += 1;
    }
    return counts;
  }, [slips]);
  const max = Math.max(1, ...bins);
  const pts = bins.map((v, i) => `${8 + (i / 6) * 184},${34 - (v / max) * 26}`).join(" ");
  return (
    <div className="pt-2">
      <svg
        viewBox="0 0 200 40"
        className="h-12 w-full overflow-visible text-hanko"
        fill="none"
        aria-hidden="true"
      >
        <path
          d={`M${pts.replaceAll(" ", " L")}`}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx="192" cy={34 - (bins[6] / max) * 26} r="4" className="fill-hanko" />
      </svg>
      <div className="mt-1 flex justify-between font-sans text-[10px] tabular-nums text-ink-muted">
        <span>{weekdayLabel(6)}</span>
        <span>{weekdayLabel(4)}</span>
        <span>{weekdayLabel(2)}</span>
        <span>Today</span>
      </div>
      <p className="mt-2 flex items-center gap-1.5 font-body text-xs text-ink-muted">
        <Droplets className="size-3.5 text-ok" aria-hidden="true" />
        Fresh ink settles most on quiet mornings.
      </p>
    </div>
  );
}
