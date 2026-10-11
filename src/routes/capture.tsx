import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CAPTURE_MESSAGE,
  CAPTURE_READY,
  CAPTURE_RECEIVED,
  parseCapturePayload,
  type BookmarkletPayload,
} from "@/lib/bookmarklet.ts";
import { stashCapturePayload } from "@/lib/session-article.ts";

type CaptureSearch = {
  /** `peek`: summarize the page on /peek before deciding to save it (extension). */
  intent?: "peek";
};

export const Route = createFileRoute("/capture")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): CaptureSearch => ({
    intent: search.intent === "peek" ? "peek" : undefined,
  }),
  component: CapturePage,
});

const WAIT_MS = 15_000;
const PING_MS = 300;

type Status = "waiting" | "received" | "failed" | "timeout";

/**
 * Accept a capture only from a sender allowed to vouch for it:
 * - the page that opened us (bookmarklet), and only for its own origin —
 *   so a random site can't push content claiming to be another site;
 * - our own window (extension content script / same-origin code).
 */
function acceptCapture(event: MessageEvent): BookmarkletPayload | null {
  const data = event.data as { type?: unknown; payload?: unknown } | null;
  if (!data || data.type !== CAPTURE_MESSAGE) return null;
  const payload = parseCapturePayload(data.payload);
  if (!payload) return null;
  if (event.source === window) {
    return event.origin === window.location.origin ? payload : null;
  }
  if (!window.opener || event.source !== window.opener) return null;
  try {
    return new URL(payload.url).origin === event.origin ? payload : null;
  } catch {
    return null;
  }
}

function CapturePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [status, setStatus] = useState<Status>("waiting");

  useEffect(() => {
    function finish(payload: BookmarkletPayload | null) {
      if (!payload) {
        setStatus("failed");
        return;
      }
      if (!stashCapturePayload(payload)) {
        setStatus("failed");
        return;
      }
      setStatus("received");
      void navigate({ to: search.intent === "peek" ? "/peek" : "/app", replace: true });
    }

    let done = false;
    const opener = window.opener as Window | null;

    function onMessage(event: MessageEvent) {
      if (done) return;
      const payload = acceptCapture(event);
      if (!payload) return;
      done = true;
      cleanup();
      // Tell the bookmarklet to stop listening, then sever the opener link.
      try {
        if (opener && event.source === opener) {
          opener.postMessage({ type: CAPTURE_RECEIVED }, event.origin);
        }
      } catch {
        // opener navigated away / closed
      }
      try {
        window.opener = null;
      } catch {
        // read-only in some browsers
      }
      finish(payload);
    }

    function ping() {
      // `kami:ready` carries no data, so "*" is safe for the opener ping —
      // the payload itself is only accepted per `acceptCapture`.
      try {
        opener?.postMessage({ type: CAPTURE_READY }, "*");
      } catch {
        // cross-origin opener gone
      }
      window.postMessage({ type: CAPTURE_READY }, window.location.origin);
    }

    window.addEventListener("message", onMessage);
    ping();
    const interval = window.setInterval(ping, PING_MS);
    const timeout = window.setTimeout(() => {
      if (done) return;
      cleanup();
      setStatus("timeout");
    }, WAIT_MS);

    function cleanup() {
      window.removeEventListener("message", onMessage);
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    }
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <p className="font-display text-2xl tracking-tight">Kami</p>
        {status === "waiting" || status === "received" ? (
          <p className="text-sm text-ink-muted" role="status" aria-live="polite">
            {status === "waiting" ? "Receiving the page…" : "Got it — opening KAMI…"}
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-muted" role="alert">
              {status === "timeout"
                ? "No page arrived. Some sites block the pop-up handoff — try the KAMI browser extension, or copy the article and use Paste article."
                : "Could not read the captured page. Try again, or copy the article and use Paste article."}
            </p>
            <Link
              to="/app"
              className="rounded-full bg-hanko px-5 py-2.5 text-sm font-medium text-white hover:bg-shu"
            >
              Go to KAMI
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
