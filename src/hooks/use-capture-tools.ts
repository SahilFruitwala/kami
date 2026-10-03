import { useState } from "react";
import { buildBookmarklet } from "@/lib/bookmarklet.ts";

/** Capture-tools dialog state + bookmarklet source, shared by app pages. */
export function useCaptureTools() {
  const [toolsOpen, setToolsOpen] = useState(false);
  // Compute lazily so the value is ready on first paint (no empty flash).
  // Library/Vault previously copied "" if the dialog was opened before useEffect ran.
  const [bookmarklet] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return buildBookmarklet(window.location.origin);
    } catch {
      return "";
    }
  });

  return { toolsOpen, setToolsOpen, bookmarklet };
}
