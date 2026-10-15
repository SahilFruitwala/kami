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
  return (
    <Dialog open={open !== null} onOpenChange={(open) => !open && settleConfirm(false)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{req?.title}</DialogTitle>
          {req?.description ? <DialogDescription>{req.description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => settleConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant={req?.destructive === false ? "default" : "destructive"}
            onClick={() => settleConfirm(true)}
            autoFocus
          >
            {req?.confirmLabel ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
