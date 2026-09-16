import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { addTransitionType, startTransition, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell.tsx";
import { ToolsDialog } from "@/components/library/library-dialogs.tsx";
import { KamiEyebrow } from "@/components/kami.tsx";
import { useCaptureTools } from "@/hooks/use-capture-tools.ts";
import { useLibraryStore, HIGHLIGHT_COLORS, READER_FONTS, READER_FONT_SIZES } from "@/lib/store.ts";
import { PAPER_TONES } from "@/lib/paper-tones.ts";
import { collectLibraryTags } from "@/lib/filter-library.ts";
import { useTheme } from "@/hooks/use-theme.ts";
import { RATES } from "@/hooks/use-reader-tts.ts";
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
import { getLibraryForExport } from "@/lib/library-fns.ts";
import { useCurrentUserState } from "@/lib/auth/use-current-user.ts";
import { cn } from "@/lib/utils.ts";
import type { LibraryItem } from "@/lib/store.ts";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return <Settings />;
}

function Settings() {
  const navigate = useNavigate();

  function openItem(item: LibraryItem) {
    startTransition(() => {
      addTransitionType("nav-forward");
      void navigate({ to: "/read", search: { id: item.id } });
    });
  }

  return (
    <AppShell active="settings" onOpenItem={openItem}>
        <section className="w-full bg-paper/60 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-7xl px-4 pt-8 pb-6 sm:px-6 lg:px-12">
            <KamiEyebrow>
              Reading Room Rules
              <span className="size-1 rounded-full bg-hanko/40" aria-hidden="true" />
              <span className="text-bamboo">Account · Appearance · Organize · Data · Help</span>
            </KamiEyebrow>
            <h2 className="mt-2 font-display text-3xl tracking-tight text-ink">Settings</h2>
            <p className="mt-2 max-w-xl font-body text-sm leading-relaxed text-ink-soft">
              Full controls live here. Compact versions stay inline in the reader and
              library — both write to the same preferences.
            </p>
            <nav aria-label="Settings sections" className="mt-4 flex flex-wrap gap-2 font-sans text-xs">
              {[
                ["#account", "Account"],
                ["#appearance", "Appearance"],
                ["#reading", "Reading & audio"],
                ["#capture", "Capture"],
                ["#organize", "Organize"],
                ["#data", "Data"],
                ["#help", "Help"],
              ].map(([href, label]) => (
                <a key={href} href={href} className="rounded-[0.25rem] bg-surface px-3 py-1.5 text-ink-soft shadow-[var(--shadow-border)] transition-colors hover:bg-paper-warm hover:text-ink">
                  {label}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-12">
          <AccountCard />
          <AppearanceCard />
          <ReadingCard />
          <CaptureCard />
          <OrganizeCard />
          <DataCard />
          <HelpCard />
        </div>
    </AppShell>
  );
}

function Card({ id, title, copy, children }: { id: string; title: string; copy: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={title} className="kami-sheet scroll-mt-24 p-6 sm:p-8">
      <h3 className="font-display text-xl text-ink">{title}</h3>
      <p className="mt-1 max-w-2xl font-body text-sm leading-relaxed text-ink-muted">{copy}</p>
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="kami-label text-ink-muted">{children}</p>;
}

function AccountCard() {
  const { user } = useCurrentUserState();
  if (!user) return null;
  const initial = (user.displayName ?? user.primaryEmail ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <Card id="account" title="Account" copy="Your name shows in the sidebar next to your avatar. Change it here anytime.">
      <div className="flex items-center gap-3">
        {user.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt=""
            className="size-11 rounded-full object-cover shadow-[var(--shadow-border)]"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-full bg-hanko font-display text-lg font-semibold text-white"
          >
            {initial}
          </span>
        )}
        <div className="min-w-0 leading-tight">
          <p className="truncate font-sans text-sm font-semibold text-ink">
            {user.displayName ?? "Name not set"}
          </p>
          {user.primaryEmail ? (
            <p className="truncate font-sans text-xs text-ink-muted">{user.primaryEmail}</p>
          ) : null}
        </div>
      </div>
      {user.isDevFallback ? (
        <p className="font-body text-sm text-ink-muted italic">
          Running without sign-in (dev mode) — connect Clerk to manage a real account.
        </p>
      ) : (
        <ClerkNameEditor key={user.id} currentName={user.displayName ?? ""} />
      )}
    </Card>
  );
}

/** Edit the Clerk profile name inline (mounted only for real Clerk users). */
function ClerkNameEditor({ currentName }: { currentName: string }) {
  const { user } = useUser();
  const [draft, setDraft] = useState(currentName);
  const [saving, setSaving] = useState(false);
  if (!user) return null;
  const unchanged = draft.trim() === currentName.trim();

  async function save() {
    const name = draft.trim();
    if (!name) {
      toast.error("Name can't be empty.");
      return;
    }
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(" ") || undefined;
    setSaving(true);
    try {
      await user!.update({ firstName, lastName });
      toast.success("Name updated");
    } catch {
      toast.error("Could not update your name — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <FieldLabel>Display name</FieldLabel>
      <div className="mt-2 flex gap-1.5">
        <input
          aria-label="Display name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Ada Lovelace"
          autoComplete="name"
          maxLength={80}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-hanko/30"
        />
        <button
          type="submit"
          disabled={saving || unchanged}
          className="h-9 shrink-0 rounded-lg bg-ink px-4 text-sm font-medium text-paper hover:bg-ink-soft disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function AppearanceCard() {
  const { theme, isSystem, setTheme, followSystem } = useTheme();
  const readerFontSize = useLibraryStore((s) => s.readerFontSize);
  const readerFont = useLibraryStore((s) => s.readerFont);
  const highlightColor = useLibraryStore((s) => s.highlightColor);
  const paperTone = useLibraryStore((s) => s.paperTone);
  const bumpReaderFontSize = useLibraryStore((s) => s.bumpReaderFontSize);
  const setReaderFont = useLibraryStore((s) => s.setReaderFont);
  const setHighlightColor = useLibraryStore((s) => s.setHighlightColor);
  const setPaperTone = useLibraryStore((s) => s.setPaperTone);

  return (
    <Card id="appearance" title="Appearance" copy="Theme, paper, and type. Mirrors the reader preferences popover — change it here or there.">
      <div>
        <FieldLabel>Theme</FieldLabel>
        <div className="mt-2 inline-flex rounded-lg bg-paper-warm p-1" role="group" aria-label="Color theme">
          {(
            [
              ["light", "Light"],
              ["dark", "Dark"],
              ["system", "System"],
            ] as const
          ).map(([id, label]) => {
            const active = id === "system" ? isSystem : theme === id && !isSystem;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => (id === "system" ? followSystem() : setTheme(id))}
                className={cn(
                  "rounded-md px-4 py-1.5 font-sans text-xs transition-colors",
                  active ? "bg-surface font-semibold text-hanko shadow-sm" : "text-ink-soft hover:text-ink",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <FieldLabel>Paper tone</FieldLabel>
        <div className="mt-2 grid max-w-lg grid-cols-3 gap-2" role="group" aria-label="Paper tone">
          {PAPER_TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={paperTone === t.id}
              onClick={() => setPaperTone(t.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors",
                paperTone === t.id ? "bg-paper-warm shadow-xs ring-1 ring-hanko/40" : "bg-bg/60 hover:bg-paper-warm/70",
              )}
            >
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md text-xs font-bold" style={{ backgroundColor: t.bg, color: t.fg, border: "1px solid var(--color-line)" }}>
                {t.glyph}
              </span>
              <span className="font-sans text-xs font-medium text-ink">{t.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <FieldLabel>Reader font</FieldLabel>
          <div className="mt-2 grid gap-1">
            {READER_FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={readerFont === f.id}
                onClick={() => setReaderFont(f.id)}
                style={{ fontFamily: f.family }}
                className={cn(
                  "rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  readerFont === f.id ? "bg-paper-warm font-semibold text-ink shadow-xs" : "text-ink-soft hover:bg-paper-warm/60 hover:text-ink",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Text size & highlight</FieldLabel>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" aria-label="Decrease font size" disabled={readerFontSize <= 0} onClick={() => bumpReaderFontSize(-1)} className="flex size-9 items-center justify-center rounded-lg bg-paper-warm text-ink disabled:opacity-40">
              −
            </button>
            <div className="flex flex-1 items-center justify-center gap-1.5" aria-hidden="true">
              {READER_FONT_SIZES.map((_, i) => (
                <span key={i} className={cn("h-2 w-2 rounded-full", i === readerFontSize ? "scale-125 bg-ink" : "bg-faint")} />
              ))}
            </div>
            <button type="button" aria-label="Increase font size" disabled={readerFontSize >= READER_FONT_SIZES.length - 1} onClick={() => bumpReaderFontSize(1)} className="flex size-9 items-center justify-center rounded-lg bg-paper-warm text-ink disabled:opacity-40">
              +
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Default highlight color">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.label}
                title={c.label}
                aria-pressed={highlightColor === c.id}
                onClick={() => setHighlightColor(c.id)}
                style={{ background: c.swatch }}
                className={cn(
                  "size-8 rounded-full border-2 transition-transform",
                  highlightColor === c.id ? "scale-110 border-ink ring-2 ring-ink/30" : "border-transparent hover:scale-105",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ReadingCard() {
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

function CaptureCard() {
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

function OrganizeCard() {
  const library = useLibraryStore((s) => s.library);
  const folders = useLibraryStore((s) => s.folders);
  const addFolder = useLibraryStore((s) => s.addFolder);
  const renameFolder = useLibraryStore((s) => s.renameFolder);
  const removeFolder = useLibraryStore((s) => s.removeFolder);
  const renameTagEverywhere = useLibraryStore((s) => s.renameTagEverywhere);
  const removeTagEverywhere = useLibraryStore((s) => s.removeTagEverywhere);
  const [folderDraft, setFolderDraft] = useState("");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [mergeFrom, setMergeFrom] = useState("");
  const [mergeInto, setMergeInto] = useState("");

  const tags = useMemo(() => collectLibraryTags(library), [library]);
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of library) {
      for (const t of row.tags ?? []) map.set(t, (map.get(t) ?? 0) + 1);
    }
    return map;
  }, [library]);

  function saveFolderName(id: string) {
    renameFolder(id, editingFolderName);
    setEditingFolder(null);
  }

  function saveTagName(old: string) {
    const n = renameTagEverywhere(old, editingTagName);
    toast.success(n > 0 ? `Renamed #${old} on ${n} works` : "Tag unchanged");
    setEditingTag(null);
  }

  return (
    <Card id="organize" title="Organize — folders & tags" copy="Rename, merge, and delete from one table. Changes apply to every work at once.">
      <div>
        <FieldLabel>Folders ({folders.length})</FieldLabel>
        <ul className="mt-2 space-y-1.5">
          {folders.length === 0 ? (
            <li className="rounded-[0.25rem] bg-bg/60 px-3 py-2.5 font-body text-sm text-ink-muted italic">
              No slipcases yet — create one below, or from the Library filter row.
            </li>
          ) : null}
          {folders.map((f) => {
            const n = library.filter((row) => row.folderId === f.id).length;
            return (
              <li key={f.id} className="flex items-center gap-2 rounded-[0.25rem] bg-bg/60 px-3 py-2">
                {editingFolder === f.id ? (
                  <>
                    <input
                      aria-label={`Rename folder ${f.name}`}
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveFolderName(f.id);
                        if (e.key === "Escape") setEditingFolder(null);
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-hanko/30"
                    />
                    <MiniButton onClick={() => saveFolderName(f.id)}>Save</MiniButton>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-sans text-sm text-ink">{f.name}</span>
                    <span className="font-sans text-[11px] text-ink-muted tabular-nums">{n} works</span>
                    <MiniButton
                      onClick={() => {
                        setEditingFolder(f.id);
                        setEditingFolderName(f.name);
                      }}
                    >
                      Rename
                    </MiniButton>
                    <MiniButton
                      danger
                      onClick={() => {
                        if (!window.confirm(`Delete slipcase “${f.name}”? ${n} works become Unfiled.`)) return;
                        removeFolder(f.id);
                        toast.success(`Deleted slipcase “${f.name}”`);
                      }}
                    >
                      Delete
                    </MiniButton>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex gap-1.5">
          <input
            aria-label="New folder name"
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (addFolder(folderDraft)) toast.success("Slipcase created");
              setFolderDraft("");
            }}
            placeholder="New slipcase…"
            autoComplete="off"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-hanko/30"
          />
          <button
            type="button"
            onClick={() => {
              if (addFolder(folderDraft)) toast.success("Slipcase created");
              setFolderDraft("");
            }}
            className="h-9 rounded-lg bg-ink px-4 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            Add
          </button>
        </div>
      </div>

      <div>
        <FieldLabel>Tags ({tags.length})</FieldLabel>
        {tags.length === 0 ? (
          <p className="mt-2 rounded-[0.25rem] bg-bg/60 px-3 py-2.5 font-body text-sm text-ink-muted italic">
            No tags yet — add one from any open work.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {tags.map((t) => (
              <li key={t} className="flex items-center gap-2 rounded-[0.25rem] bg-bg/60 px-3 py-2">
                {editingTag === t ? (
                  <>
                    <input
                      aria-label={`Rename tag ${t}`}
                      value={editingTagName}
                      onChange={(e) => setEditingTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveTagName(t);
                        if (e.key === "Escape") setEditingTag(null);
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-hanko/30"
                    />
                    <MiniButton onClick={() => saveTagName(t)}>Save</MiniButton>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-sans text-sm text-ink">#{t}</span>
                    <span className="font-sans text-[11px] text-ink-muted tabular-nums">
                      {tagCounts.get(t) ?? 0} works
                    </span>
                    <MiniButton
                      onClick={() => {
                        setEditingTag(t);
                        setEditingTagName(t);
                      }}
                    >
                      Rename
                    </MiniButton>
                    <MiniButton
                      danger
                      onClick={() => {
                        if (!window.confirm(`Remove tag #${t} from every work?`)) return;
                        const n = removeTagEverywhere(t);
                        toast.success(`Removed #${t} from ${n} works`);
                      }}
                    >
                      Delete
                    </MiniButton>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {tags.length >= 2 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="font-sans text-xs text-ink-muted">Merge</span>
            <select
              aria-label="Merge tag from"
              value={mergeFrom}
              onChange={(e) => setMergeFrom(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2 font-sans text-xs text-ink"
            >
              <option value="">From…</option>
              {tags.map((t) => (
                <option key={t} value={t}>#{t}</option>
              ))}
            </select>
            <span className="font-sans text-xs text-ink-muted">into</span>
            <select
              aria-label="Merge tag into"
              value={mergeInto}
              onChange={(e) => setMergeInto(e.target.value)}
              className="h-8 rounded-md border border-line bg-surface px-2 font-sans text-xs text-ink"
            >
              <option value="">Into…</option>
              {tags.map((t) => (
                <option key={t} value={t}>#{t}</option>
              ))}
            </select>
            <MiniButton
              onClick={() => {
                if (!mergeFrom || !mergeInto || mergeFrom === mergeInto) {
                  toast.error("Pick two different tags to merge.");
                  return;
                }
                const n = renameTagEverywhere(mergeFrom, mergeInto);
                toast.success(`Merged #${mergeFrom} into #${mergeInto} (${n} works)`);
                setMergeFrom("");
                setMergeInto("");
              }}
            >
              Merge
            </MiniButton>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function MiniButton({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-[0.25rem] px-2.5 py-1 font-sans text-xs font-medium transition-colors",
        danger ? "text-danger hover:bg-danger/10" : "bg-paper-warm text-ink hover:bg-line",
      )}
    >
      {children}
    </button>
  );
}

function DataCard() {
  const library = useLibraryStore((s) => s.library);
  const folders = useLibraryStore((s) => s.folders);
  const upsertItem = useLibraryStore((s) => s.upsertItem);
  const mergeItems = useLibraryStore((s) => s.mergeItems);
  const clearLibrary = useLibraryStore((s) => s.clearLibrary);
  const fileRef = useRef<HTMLInputElement>(null);

  const dupes = useMemo(() => findDuplicateGroups(library), [library]);
  const slipCount = useMemo(() => library.reduce((n, row) => n + (row.highlights?.length ?? 0), 0), [library]);

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
      const snapshot = await getLibraryForExport();
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
      toast.error(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  return (
    <Card id="data" title="Data — export, import & account" copy="Your library, your file. Exports download immediately; imports merge by URL so nothing duplicates.">
      <div className="flex flex-wrap gap-2">
        <ExportButton onClick={exportJson}>Library JSON</ExportButton>
        <ExportButton onClick={exportOpml}>OPML (RSS readers)</ExportButton>
        <ExportButton onClick={exportVaultCsv}>Vault CSV ({slipCount} slips)</ExportButton>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-[0.25rem] bg-paper-warm px-4 py-2 font-sans text-xs font-medium text-ink hover:bg-line"
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
      </div>

      <div>
        <FieldLabel>Possible duplicates ({dupes.length})</FieldLabel>
        {dupes.length === 0 ? (
          <p className="mt-2 rounded-[0.25rem] bg-bg/60 px-3 py-2.5 font-body text-sm text-ink-muted italic">
            No duplicates detected — URLs and titles all look distinct.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {dupes.slice(0, 10).map((group, i) => (
              <li key={group.map((g) => g.id).join("|")} className="rounded-[0.25rem] bg-bg/60 p-3">
                <p className="font-sans text-xs font-semibold text-ink">
                  {group.length} copies of “{group[0]!.title.slice(0, 60)}”
                </p>
                <ul className="mt-1 space-y-0.5">
                  {group.map((row) => (
                    <li key={row.id} className="truncate font-body text-xs text-ink-muted">
                      {new Date(row.savedAt).toLocaleDateString()} · {row.highlights.length} highlights · {row.url}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <MiniButton
                    onClick={() => {
                      const [keep, ...rest] = [...group].sort((a, b) => a.savedAt - b.savedAt);
                      for (const drop of rest) mergeItems(keep!.id, drop.id);
                      toast.success(`Merged ${rest.length} ${rest.length === 1 ? "copy" : "copies"} — tags and highlights kept`);
                    }}
                  >
                    Merge (keep oldest)
                  </MiniButton>
                  <span className="font-sans text-[11px] text-ink-muted">or open each work from the Library to keep both.</span>
                </div>
                {i === 9 && dupes.length > 10 ? (
                  <p className="mt-1 font-sans text-[11px] text-ink-muted">…and {dupes.length - 10} more groups.</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-[0.25rem] border border-danger/30 bg-danger/5 p-4">
        <p className="font-sans text-sm font-semibold text-danger">Danger zone</p>
        <p className="mt-1 font-body text-sm text-ink-muted">
          Export first — this deletes every work, folder, and highlight from
          this device <em>and</em> your account on the server.
        </p>
        <button
          type="button"
          onClick={() => {
            if (!window.confirm("Delete your entire library? This cannot be undone. Export first.")) return;
            if (!window.confirm("Really delete everything, including the server copy? Last chance.")) return;
            void (async () => {
              try {
                await wipeLibraryAccount();
                toast.success("Library deleted everywhere");
              } catch {
                clearLibrary();
                toast.error("Server unreachable — cleared this device only. Try again online to finish.");
              }
            })();
          }}
          className="mt-3 rounded-[0.25rem] bg-danger px-4 py-2 font-sans text-xs font-semibold text-white hover:brightness-110"
        >
          Delete all library data
        </button>
      </div>
    </Card>
  );
}

function ExportButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[0.25rem] bg-hanko px-4 py-2 font-sans text-xs font-semibold text-white shadow-sm hover:bg-shu"
    >
      {children}
    </button>
  );
}

function HelpCard() {
  return (
    <Card id="help" title="Help — your first evening with Kami" copy="Three steps to a quiet desk. This same guide appears when your desk is empty.">
      <ol className="grid gap-3 md:grid-cols-3">
        {[
          ["1 · Bind a link", "Paste a blog or X URL on Home. Kami keeps a clean, distraction-free copy."],
          ["2 · Ink a passage", "Select any passage in the reader. It is pressed into the Highlight Vault as a slip."],
          ["3 · Find it in seconds", "Filter the Library, or press ⌘K to jump to works, highlights, and tags."],
        ].map(([t, c]) => (
          <li key={t} className="rounded-[0.25rem] bg-bg/60 p-4">
            <p className="font-sans text-sm font-semibold text-ink">{t}</p>
            <p className="mt-1 font-body text-sm leading-relaxed text-ink-muted">{c}</p>
          </li>
        ))}
      </ol>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-[0.25rem] bg-bg/60 p-4">
          <p className="font-sans text-sm font-semibold text-ink">Keyboard</p>
          <ul className="mt-1 space-y-1 font-sans text-xs text-ink-muted">
            <li><kbd className="rounded bg-paper-warm px-1.5 py-0.5">⌘/Ctrl K</kbd> — command palette</li>
            <li><kbd className="rounded bg-paper-warm px-1.5 py-0.5">G</kbd> then <kbd className="rounded bg-paper-warm px-1.5 py-0.5">H/L/V/S</kbd> — Home / Library / Vault / Settings</li>
          </ul>
        </div>
        <div className="rounded-[0.25rem] bg-bg/60 p-4">
          <p className="font-sans text-sm font-semibold text-ink">Capture troubleshooting</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 font-body text-sm text-ink-muted">
            <li>Bot wall? Use the bookmarklet on desktop or Paste article anywhere.</li>
            <li>Truncated import? Try a smaller article section.</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
