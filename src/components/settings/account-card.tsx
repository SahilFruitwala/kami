import { useState } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { toast } from "sonner";
import { CharacterAvatar } from "@/components/character-avatar.tsx";
import { useCharacter } from "@/hooks/use-character.ts";
import { useCurrentUserState } from "@/lib/auth/use-current-user.ts";
import { cn } from "@/lib/utils.ts";
import { Card, FieldLabel } from "@/components/settings/settings-ui.tsx";

export function AccountCard() {
  const { user } = useCurrentUserState();
  if (!user) return null;

  return (
    <Card
      id="account"
      title="Account"
      copy="Your name appears in your greeting on Home. Change it here anytime."
    >
      <div className="flex items-center gap-3">
        <CharacterAvatar menu={false} className="size-11 shadow-[var(--shadow-border)]" />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-sans text-sm font-semibold text-ink">
            {user.displayName ?? "Name not set"}
          </p>
          {user.primaryEmail ? (
            <p className="truncate font-sans text-xs text-ink-muted">{user.primaryEmail}</p>
          ) : null}
        </div>
      </div>
      <CharacterPicker />
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

function CharacterPicker() {
  const { characters, displayId, saving, select } = useCharacter();
  return (
    <div>
      <FieldLabel>Character</FieldLabel>
      <p className="mt-1 font-body text-sm text-ink-muted">
        Pick one of these instead of the default silhouette. You can change it anytime.
      </p>
      <div
        className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8"
        role="radiogroup"
        aria-label="Avatar character"
      >
        {characters.map((character) => {
          const selected = character.id === displayId;
          return (
            <button
              key={character.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${character.label}, ${character.gloss}`}
              disabled={saving}
              onClick={() => void select(character.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/30 disabled:opacity-60",
                selected ? "bg-paper-warm" : "hover:bg-paper-warm/60",
              )}
            >
              <img
                src={character.src}
                alt=""
                className={cn(
                  "size-12 rounded-full object-cover sm:size-14",
                  selected && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
                )}
                draggable={false}
              />
              <span className="font-sans text-[11px] text-ink-muted">{character.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Edit the Clerk profile name inline (mounted only for real Clerk users). */
export function ClerkNameEditor({ currentName }: { currentName: string }) {
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
