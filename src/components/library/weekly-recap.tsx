import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAiStatus } from "@/hooks/use-ai.ts";
import { aiApi, type WeeklyRecap as Recap } from "@/lib/api/ai";
import { queryKeys } from "@/lib/query-client.ts";

const DAY_MS = 86_400_000;

/** "Your week in reading": a recap made on demand, shown on the desk. */
export function WeeklyRecap() {
  const { enabled } = useAiStatus();
  if (!enabled) return null;
  return <RecapCard />;
}

function RecapCard() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.ai.recap(),
    queryFn: () => aiApi.weeklyRecap(),
    staleTime: Infinity,
    retry: false,
  });
  const make = useMutation({
    mutationFn: () => aiApi.makeWeeklyRecap(),
    onSuccess: (recap) => client.setQueryData(queryKeys.ai.recap(), recap),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not make a recap."),
  });
  if (query.isPending) return null;
  const recap = query.data ?? null;
  // An old recap stays visible but invites a fresh one.
  const old = recap ? Date.now() - recap.createdAt > 6 * DAY_MS : false;

  return (
    <section aria-label="Your week in reading" className="kami-sheet mt-10 w-full space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-sans text-sm font-semibold text-ink">
          <Sparkles className="size-4 text-hanko" aria-hidden="true" />
          Your week in reading
        </p>
        {recap ? (
          <button
            type="button"
            onClick={() => make.mutate()}
            disabled={make.isPending}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 font-sans text-xs text-ink-muted transition-colors hover:bg-paper-warm hover:text-ink disabled:opacity-50"
          >
            {make.isPending ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="size-3.5" aria-hidden="true" />
            )}
            {old ? "New recap" : "Refresh"}
          </button>
        ) : null}
      </div>
      {recap ? (
        <RecapBody recap={recap} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-sm text-ink-muted">
            A short look back at what you saved and highlighted in the past seven days.
          </p>
          <button
            type="button"
            onClick={() => make.mutate()}
            disabled={make.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-hanko px-4 font-sans text-xs font-semibold text-paper transition-colors hover:bg-shu disabled:opacity-60"
          >
            {make.isPending ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-3.5" aria-hidden="true" />
            )}
            {make.isPending ? "Looking back…" : "Recap my week"}
          </button>
        </div>
      )}
    </section>
  );
}

function RecapBody({ recap }: { recap: Recap }) {
  const { stats } = recap;
  return (
    <div className="space-y-4">
      <p className="font-sans text-[11px] text-ink-muted">
        {recap.from} → {recap.to} · {stats.saved} saved · {stats.finished} finished ·{" "}
        {stats.highlights} highlight{stats.highlights === 1 ? "" : "s"}
      </p>
      <p className="font-body text-sm leading-relaxed text-ink">{recap.recap}</p>
      {recap.themes.length ? (
        <div className="flex flex-wrap gap-1.5">
          {recap.themes.map((t) => (
            <span
              key={t}
              className="rounded bg-shu-tint px-2 py-0.5 font-sans text-[11px] text-hanko"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {recap.standout ? (
        <Link
          to="/read"
          search={{ id: recap.standout.articleId }}
          className="block border-l-2 border-hanko/50 pl-3 transition-colors hover:text-hanko"
        >
          <span className="block font-display text-base leading-snug text-ink italic">
            “
            {recap.standout.text.length > 280
              ? `${recap.standout.text.slice(0, 280)}…`
              : recap.standout.text}
            ”
          </span>
          <span className="font-sans text-[11px] text-ink-muted">{recap.standout.title}</span>
        </Link>
      ) : null}
      {recap.prompt ? (
        <p className="rounded-lg bg-bg/70 px-3 py-2.5 font-body text-sm text-ink-soft">
          <span className="kami-label mr-1.5 text-ink-muted">Reflect</span>
          {recap.prompt}
        </p>
      ) : null}
      {recap.nextRead ? (
        <Link
          to="/read"
          search={{ id: recap.nextRead.articleId }}
          className="flex items-center gap-3 rounded-lg bg-paper-warm px-3 py-2.5 transition-colors hover:text-hanko"
        >
          <span className="min-w-0 flex-1">
            <span className="kami-label block text-ink-muted">Read next</span>
            <span className="block truncate font-sans text-sm font-medium text-ink">
              {recap.nextRead.title}
            </span>
            {recap.nextRead.reason ? (
              <span className="block font-body text-xs text-ink-muted">
                {recap.nextRead.reason}
              </span>
            ) : null}
          </span>
          <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
