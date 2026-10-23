import { toast } from "sonner";
import { Stamp } from "@/components/gloss/stamp.tsx";

const MESSAGES = {
  finished: "Finished. Nicely done.",
  loved: "Added to favorites.",
  shared: "Link copied.",
  welcome: "Welcome in,",
} as const;

export type StampKind = keyof typeof MESSAGES;

/** A toast led by a freshly pressed persimmon tick, for "done" moments. */
export function stampToast(kind: StampKind, detail?: string) {
  toast(detail ? `${MESSAGES[kind]} ${detail}` : MESSAGES[kind], {
    icon: <Stamp size={28} />,
  });
}
