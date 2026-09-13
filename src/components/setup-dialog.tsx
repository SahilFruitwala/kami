import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { isKindleEmail, KINDLE_SETTINGS_URL } from "@/lib/kindle-email.ts";
import { useKindleStore } from "@/lib/store.ts";

export function SetupDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const stored = useKindleStore((s) => s.kindleEmail);
  const setKindleEmail = useKindleStore((s) => s.setKindleEmail);
  const [value, setValue] = useState(stored);
  const [error, setError] = useState("");

  function save() {
    if (!isKindleEmail(value)) {
      setError("Use your Send-to-Kindle address, like name@kindle.com");
      return;
    }
    setKindleEmail(value);
    setError("");
    toast.success("Kindle address saved on this device");
    onOpenChange(false);
    onSaved?.();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(stored);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect your Kindle</DialogTitle>
          <DialogDescription>
            Amazon gives every Kindle a private email. Documents sent there appear
            in your library after a short conversion.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 text-sm leading-normal text-ink-soft">
          <li className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-paper-warm font-medium text-ink tabular-nums">
              1
            </span>
            <span>
              Open{" "}
              <a
                href={KINDLE_SETTINGS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-ink underline decoration-faint underline-offset-2"
              >
                Content & Devices
                <ExternalLink className="size-3.5" />
              </a>{" "}
              and copy your Send-to-Kindle email.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-paper-warm font-medium text-ink tabular-nums">
              2
            </span>
            <span>
              Under Personal Document Settings, add the Gmail address you will send
              from to the approved list.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-paper-warm font-medium text-ink tabular-nums">
              3
            </span>
            <span>Paste the Kindle address below. It stays on this device only.</span>
          </li>
        </ol>

        <div className="grid gap-2">
          <Label htmlFor="kindle-email">Send-to-Kindle email</Label>
          <Input
            id="kindle-email"
            type="email"
            autoComplete="email"
            placeholder="yourname@kindle.com"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <Button className="w-full" onClick={save}>
          Save Kindle address
        </Button>
      </DialogContent>
    </Dialog>
  );
}
