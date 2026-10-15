import { LoaderCircle } from "lucide-react";
import { errorMessage } from "@/lib/errors";
import { useEntrySummary } from "@/hooks/use-ai.ts";

/** A short summary of one entry, fetched (and cached server-side) on first open. */
export function EntrySummary({ entryId }: { entryId: string }) {
  const query = useEntrySummary(entryId);
  if (query.isPending) {
    return (
      <p className="mt-3 flex items-center gap-1.5 font-sans text-xs text-ink-muted">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        Summarizing…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p className="mt-3 font-sans text-xs text-hanko">
        {errorMessage(query.error, "Could not summarize this entry.")}
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-1.5 rounded-md bg-bg/70 px-3 py-2.5">
      <p className="font-body text-sm leading-relaxed text-ink">{query.data.tldr}</p>
      {query.data.keyPoints.length ? (
        <ul className="list-disc space-y-0.5 pl-4 font-body text-xs text-ink-soft">
          {query.data.keyPoints.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
