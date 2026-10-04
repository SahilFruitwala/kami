import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseBulkUrls } from "@/lib/session-article.ts";

type ShareSearch = {
  url?: string;
  text?: string;
  title?: string;
};

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 4000) : undefined;
}

/**
 * Web Share Target (see `share_target` in site.webmanifest). When KAMI is
 * installed as an app, the OS share sheet sends `?url=&text=&title=` here.
 * Many Android apps put the link in `text` rather than `url`, so take the
 * first URL from either and hand it to Home, which saves it on arrival.
 */
export const Route = createFileRoute("/share")({
  validateSearch: (search: Record<string, unknown>): ShareSearch => ({
    url: str(search.url),
    text: str(search.text),
    title: str(search.title),
  }),
  beforeLoad: ({ search }) => {
    const shared = parseBulkUrls([search.url, search.text].filter(Boolean).join(" "))[0];
    throw redirect({ to: "/app", search: shared ? { save: shared } : {}, replace: true });
  },
});
