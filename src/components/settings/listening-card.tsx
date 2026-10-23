import { useQuery } from "@tanstack/react-query";
import { Card, FieldLabel } from "@/components/settings/settings-ui.tsx";
import { longArticlesEstimate, type AllowanceEntry } from "@/lib/allowance";
import { narrationApi } from "@/lib/api/narration";
import { queryKeys } from "@/lib/query-client.ts";

const chars = (n: number) => `${n.toLocaleString()} characters`;

const ENTRY_LABEL: Record<AllowanceEntry["kind"], string> = {
  grant: "Added",
  reserve: "Narration",
  release: "Returned",
};

/**
 * The reader's own narration allowance: what's left to spend on audio,
 * what unfinished narrations are holding, and where it went. Hidden when
 * narration isn't set up on this server.
 */
export function ListeningCard() {
  const query = useQuery({
    queryKey: queryKeys.narration.allowance(),
    queryFn: () => narrationApi.allowance(),
    staleTime: 30_000,
  });
  const view = query.data;
  if (!view?.enabled) return null;

  return (
    <Card
      id="listening"
      title="Listening"
      copy="Articles can be narrated aloud. Each narration spends characters from your allowance, about one for every letter read."
    >
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <div>
          <FieldLabel>Available</FieldLabel>
          <p className="mt-1 font-display text-2xl text-ink">{chars(view.available)}</p>
          <p className="font-body text-sm text-ink-muted">{longArticlesEstimate(view.available)}</p>
        </div>
        {view.reserved > 0 ? (
          <div>
            <FieldLabel>Held by narrations in progress</FieldLabel>
            <p className="mt-1 font-display text-2xl text-ink">{chars(view.reserved)}</p>
          </div>
        ) : null}
      </div>
      {view.available <= 0 && !view.entries.length ? (
        <p className="font-body text-sm text-ink-muted">
          You don't have narration allowance yet. Ask whoever runs this Kami to add some.
        </p>
      ) : null}
      {view.entries.length ? (
        <div>
          <FieldLabel>Recent</FieldLabel>
          <ul className="mt-2 divide-y divide-line">
            {view.entries.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-4 py-2">
                <span className="min-w-0 font-body text-sm text-ink">
                  {ENTRY_LABEL[entry.kind]}
                  {entry.note ? <span className="text-ink-muted"> · {entry.note}</span> : null}
                  <span className="block font-sans text-[11px] text-ink-muted">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="shrink-0 font-sans text-sm tabular-nums text-ink">
                  {entry.chars > 0 ? "+" : "−"}
                  {Math.abs(entry.chars).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
