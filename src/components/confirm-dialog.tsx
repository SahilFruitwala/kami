import { useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { currentConfirm, settleConfirm, subscribeConfirm } from "@/lib/confirm.ts";

export function ConfirmHost() {
  const open = useSyncExternalStore(subscribeConfirm, currentConfirm, () => null);
  // Keep the last request on screen while the dialog animates closed.
  const last = useRef(open);
  if (open) last.current = open;
  const req = open ?? last.current;
  const destructive = req?.destructive !== false;
  return (
    <Dialog open={open !== null} onOpenChange={(open) => !open && settleConfirm(false)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{req?.title}</DialogTitle>
          {req?.description ? <DialogDescription>{req.description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          {/* Destructive asks start on Cancel, so a stray Enter can't delete. */}
          <Button variant="outline" onClick={() => settleConfirm(false)} autoFocus={destructive}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => settleConfirm(true)}
            autoFocus={!destructive}
          >
            {req?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
