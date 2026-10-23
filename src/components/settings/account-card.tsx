import { useState } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { toast } from "sonner";
import { useCurrentUserState } from "@/lib/auth/use-current-user.ts";
import { Card, FieldLabel } from "@/components/settings/settings-ui.tsx";

export function AccountCard() {
  const { user } = useCurrentUserState();
  if (!user) return null;
  const initial =
    (user.displayName ?? user.primaryEmail ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <Card
      id="account"
      title="Account"
      copy="Your name appears in your greeting on Home. Change it here anytime."
    >
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
            className="flex size-11 items-center justify-center rounded-full bg-hanko font-display text-lg font-medium text-paper"
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
