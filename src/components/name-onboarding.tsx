import { useState } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { authEnabled } from "@/lib/auth/client.ts";

/**
 * Post-sign-up name prompt. Asks once when a signed-in Clerk user has no
 * name yet so we can greet them by name in the nav and settings.
 * Skippable — reappears on next visit until a name is set.
 */
export function NameOnboarding() {
  if (!authEnabled) return null;
  return <NameOnboardingInner />;
}

function NameOnboardingInner() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // Skipped for this session — reappears on next visit until a name is set.
  const [skipped, setSkipped] = useState(false);

  if (!isLoaded || skipped) return null;
  if (!isSignedIn || !user) return null;

  const hasName = Boolean(
    user.fullName?.trim() || user.firstName?.trim() || user.username?.trim(),
  );
  if (hasName) return null;

  const clerkUser = user;

  async function save() {
    const name = draft.trim();
    if (!name) {
      toast.error("Tell us what to call you — or skip for now.");
      return;
    }
    // Split "Ada Lovelace" → first/last so Clerk's fullName renders well.
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(" ") || undefined;
    setSaving(true);
    try {
      await clerkUser.update({ firstName, lastName });
      toast.success(`Welcome, ${firstName}!`);
      setDraft("");
    } catch {
      toast.error("Could not save your name — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) setSkipped(true); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-lg text-ink">
            What should we call you?
          </DialogTitle>
          <DialogDescription className="font-body text-sm text-ink-muted">
            Your name shows in the sidebar and settings. You can change it
            anytime.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Ada Lovelace"
            autoComplete="name"
            aria-label="Your name"
            maxLength={80}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSkipped(true)}>
              Skip for now
            </Button>
            <Button type="submit" disabled={saving} className="bg-hanko text-paper hover:bg-shu">
              {saving ? "Saving…" : "Save name"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
