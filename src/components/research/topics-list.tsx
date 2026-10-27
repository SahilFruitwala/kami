import { Link } from "@tanstack/react-router";
import { FolderSearch } from "lucide-react";
import { useResearchTopics } from "@/hooks/use-research.ts";
import { relativeDay } from "./research-format.ts";
import { EmptyNote } from "./research-ui.tsx";

/** The caller's topics: name, live ideas, last run, last activity. */
export function TopicsList() {
  const topics = useResearchTopics();

  if (topics.isPending) {
    return <div className="kami-sheet h-32 animate-pulse opacity-60" aria-hidden="true" />;
  }
  if (topics.isError)
    return <EmptyNote>Couldn't load your topics. Try again in a moment.</EmptyNote>;
  if (!topics.data.length) {
    return (
      <EmptyNote>
        No topics yet. Find ideas above and a topic is made for you, named after what you searched.
      </EmptyNote>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {topics.data.map((t) => (
        <li key={t.id} className="list-none">
          <Link
            to="/research/$topicId"
            params={{ topicId: t.id }}
            className="kami-sheet flex h-full flex-col gap-2 p-4 transition-colors hover:bg-paper-warm focus-visible:ring-2 focus-visible:ring-hanko/40 focus-visible:outline-none"
          >
            <span className="flex items-start gap-2 font-display text-lg leading-tight text-ink">
              <FolderSearch className="mt-1 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
              {t.name}
            </span>
            <span className="font-sans text-xs text-ink-soft">
              {t.liveIdeas} {t.liveIdeas === 1 ? "idea" : "ideas"} · last run{" "}
              {relativeDay(t.lastRunAt)}
            </span>
            <span className="mt-auto font-sans text-[11px] text-ink-muted">
              Updated {relativeDay(t.updatedAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
