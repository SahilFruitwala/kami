import "@tanstack/react-start/server-only";
import { imageStore, MAX_WARM_IMAGES, warmImages } from "@/lib/image-store.server.ts";
import { runInBackground } from "@/server/background";

/**
 * Copy images (proxy targets) into R2 after the response, so they outlive
 * their source. A no-op when R2 isn't configured.
 */
export function keepImages(targets: string[], limit = MAX_WARM_IMAGES): void {
  const store = imageStore();
  if (!store || !targets.length) return;
  runInBackground("image-store", () => warmImages(store, targets, { limit }));
}
