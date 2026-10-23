import { useState } from "react";
import { Check, ChevronRight, LoaderCircle } from "lucide-react";
import {
  useSeasonEpisodes,
  useSetSeasonWatched,
  useShowSeasons,
  useToggleEpisode,
  useFetchSeasonEpisodes,
} from "@/hooks/use-shelf-queries.ts";
import { cn } from "@/lib/utils.ts";

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min((done / total) * 100, 100) : 0;
  return (
    <span
      className="block h-1 w-full overflow-hidden rounded-full bg-paper-warm"
      aria-hidden="true"
    >
      <span
        className={cn(
          "block h-full rounded-full transition-[width] duration-300",
          done >= total && total > 0 ? "bg-hanko" : "bg-bamboo",
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

function SeasonEpisodes({ itemId, season }: { itemId: string; season: number }) {
  const { data: episodes, isPending } = useSeasonEpisodes(itemId, season);
  const toggle = useToggleEpisode(itemId);
  const bulk = useSetSeasonWatched(itemId);

  if (isPending) {
    return (
      <p className="flex items-center gap-2 py-3 pl-6 font-sans text-xs text-ink-muted">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        Loading episodes…
      </p>
    );
  }

  if (!episodes || episodes.length === 0) {
    return (
      <p className="py-3 pl-6 font-sans text-xs text-ink-muted">
        TMDB lists no episodes for this season.
      </p>
    );
  }

  const allWatched = episodes.every((e) => e.watched);

  return (
    <div className="pb-2 pl-5">
      <button
        type="button"
        onClick={() =>
          bulk.mutate({
            season,
            numbers: episodes.map((e) => e.number),
            watched: !allWatched,
          })
        }
        disabled={bulk.isPending}
        className="mb-1 font-sans text-xs font-medium text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40 disabled:opacity-50"
      >
        {allWatched ? "Clear whole season" : "Mark whole season watched"}
      </button>
      <ul>
        {episodes.map((e) => (
          <li key={e.number}>
            <button
              type="button"
              onClick={() => toggle.mutate({ season: e.season, number: e.number })}
              disabled={toggle.isPending}
              aria-pressed={e.watched}
              className="flex w-full items-center gap-2.5 rounded-lg py-1.5 pr-2 text-left hover:bg-paper-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40 disabled:opacity-60"
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-[0.125rem] border",
                  e.watched ? "border-hanko bg-hanko text-paper" : "border-line bg-surface",
                )}
                aria-hidden="true"
              >
                {e.watched ? <Check className="size-3" /> : null}
              </span>
              <span className="min-w-12 shrink-0 font-sans text-xs tabular-nums text-ink-muted">
                S{e.season}E{e.number}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate font-sans text-[13px]",
                  e.watched ? "text-ink-soft" : "text-ink",
                )}
              >
                {e.title}
              </span>
              {e.airDate ? (
                <span className="shrink-0 font-sans text-[11px] tabular-nums text-ink-faint">
                  {e.airDate.slice(0, 4)}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Season accordion with per-episode ticks — Renzoku / shelf EpisodeTracker. */
export function EpisodeTracker({ itemId }: { itemId: string }) {
  const fetchSeasonEpisodes = useFetchSeasonEpisodes();
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const { data, isPending } = useShowSeasons(itemId);
  const seasonBulk = useSetSeasonWatched(itemId);

  if (isPending) {
    return (
      <p className="flex items-center gap-2 py-3 font-sans text-xs text-ink-muted">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        Loading seasons…
      </p>
    );
  }

  if (!data || data.seasons.length === 0) {
    return (
      <p className="py-2 font-sans text-xs text-ink-muted">
        {data?.hasTmdb === false
          ? "No TMDB match on this show, so there’s no episode list to track."
          : "TMDB lists no seasons for this show."}
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="kami-label text-ink-muted">Episodes</p>
        <p className="font-sans text-xs tabular-nums text-ink-soft">
          {data.watchedTotal} watched
          {data.unmatched > 0 ? `, ${data.unmatched} unmatched` : ""}
        </p>
      </div>
      {data.unmatched > 0 ? (
        <p className="mb-2 font-sans text-[11px] text-ink-muted">
          {data.unmatched} watched episode{data.unmatched === 1 ? "" : "s"} don’t match TMDB’s
          season numbering — they still count toward the total but won’t appear ticked below.
        </p>
      ) : null}
      <ul className="divide-y divide-line border-t border-line">
        {data.seasons.map((s) => {
          const open = openSeason === s.season;
          const complete = s.episodeCount > 0 && s.watchedCount >= s.episodeCount;
          return (
            <li key={s.season}>
              <div className="flex w-full items-center gap-2 py-2 hover:bg-paper-warm/60">
                <button
                  type="button"
                  onClick={() => setOpenSeason(open ? null : s.season)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 shrink-0 text-ink-muted transition-transform duration-200",
                      open && "rotate-90",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "truncate font-sans text-[13px] font-medium",
                          complete ? "text-ink-soft" : "text-ink",
                        )}
                      >
                        {s.name}
                      </span>
                      <span className="shrink-0 font-sans text-[11px] tabular-nums text-ink-muted">
                        {s.watchedCount}/{s.episodeCount}
                      </span>
                    </span>
                    <span className="mt-1 block">
                      <ProgressBar done={s.watchedCount} total={s.episodeCount} />
                    </span>
                  </span>
                </button>
                {s.episodeCount > 0 ? (
                  <button
                    type="button"
                    title={complete ? "Clear whole season" : "Mark whole season watched"}
                    aria-label={complete ? "Clear whole season" : "Mark whole season watched"}
                    onClick={() => {
                      void (async () => {
                        const episodes = await fetchSeasonEpisodes(itemId, s.season);
                        seasonBulk.mutate({
                          season: s.season,
                          numbers: episodes.map((e) => e.number),
                          watched: !complete,
                        });
                      })();
                    }}
                    disabled={seasonBulk.isPending}
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-[0.125rem] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40 disabled:opacity-50",
                      complete
                        ? "border-hanko bg-hanko text-paper"
                        : "border-line bg-surface hover:border-ink-muted",
                    )}
                  >
                    {complete ? <Check className="size-3.5" aria-hidden="true" /> : null}
                  </button>
                ) : null}
              </div>
              {open ? <SeasonEpisodes itemId={itemId} season={s.season} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
