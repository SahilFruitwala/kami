import { useEffect, useState } from "react";
import { buildBookmarklet } from "@/lib/bookmarklet.ts";

/** Capture-tools dialog state + bookmarklet source, shared by app pages. */
export function useCaptureTools() {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [bookmarklet, setBookmarklet] = useState("");

  useEffect(() => {
    setBookmarklet(buildBookmarklet(window.location.origin));
  }, []);

  return { toolsOpen, setToolsOpen, bookmarklet };
}
