import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tv } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { lookupApi } from "@/lib/api/lookup";
import { cn } from "@/lib/utils.ts";

function guessCountry(): string {
  if (typeof navigator === "undefined") return "US";
  for (const loc of navigator.languages ?? [navigator.language]) {
    const region = loc.split("-")[1];
    if (region && region.length === 2) return region.toUpperCase();
  }
  return "US";
}

function safeHttpUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function WatchWhereSkeleton() {
  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1.5"
      aria-busy="true"
      aria-label="Finding where to watch"
    >
      <Skeleton className="h-4 w-20" />
      <Skeleton className="size-7 rounded-[0.25rem]" />
      <Skeleton className="size-7 rounded-[0.25rem]" />
      <Skeleton className="size-7 rounded-[0.25rem]" />
    </div>
  );
}

/** Live "where to watch" strip for a movie/TV title (TMDB / JustWatch). */
export function WatchWhere({
  tmdbId,
  kind,
  className,
}: {
  tmdbId: string;
  kind: "movie" | "tv";
  className?: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["watch-providers", kind, tmdbId],
    queryFn: () => lookupApi.watchProviders(tmdbId, kind),
    staleTime: 1000 * 60 * 60 * 12,
  });
  const [country, setCountry] = useState<string | null>(null);

  if (isLoading) return <WatchWhereSkeleton />;
  if (isError || !data || data.length === 0) {
    return (
      <p
        className={cn("mt-2 flex items-center gap-1.5 font-sans text-xs text-ink-faint", className)}
      >
        <Tv className="size-3 shrink-0" aria-hidden="true" />
        No streaming info available.
      </p>
    );
  }

  const guess = guessCountry();
  const active =
    data.find((c) => c.code === (country ?? guess)) ?? data.find((c) => c.code === "US") ?? data[0];
  const list = active.streaming.length > 0 ? active.streaming : active.rent;
  const rentOnly = active.streaming.length === 0;
  const shown = list.slice(0, 6);
  const extra = list.length - shown.length;
  const providerLink = safeHttpUrl(active.link);

  return (
    <div
      className={cn(
        "mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1.5 font-sans text-xs",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-ink-muted">
        <Tv className="size-3.5 shrink-0" aria-hidden="true" />
        {rentOnly ? "Rent/buy" : "Watch on"}
      </span>
      {shown.map((p) =>
        p.logo ? (
          <a
            key={p.name}
            href={providerLink}
            target="_blank"
            rel="noreferrer"
            title={p.name}
            aria-label={p.name}
            className="group/logo relative"
          >
            <img
              src={p.logo}
              alt=""
              loading="lazy"
              className="size-7 rounded-[0.25rem] border border-line object-cover transition-transform group-hover/logo:scale-110"
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-[0.25rem] border border-line bg-paper px-2 py-0.5 text-[11px] font-medium text-ink opacity-0 shadow-sm transition-opacity group-hover/logo:opacity-100">
              {p.name}
            </span>
          </a>
        ) : (
          <a
            key={p.name}
            href={providerLink}
            target="_blank"
            rel="noreferrer"
            className="rounded-[0.25rem] border border-line bg-paper-warm px-2.5 py-0.5 font-medium text-ink-soft transition-colors hover:border-ink-faint hover:text-ink"
          >
            {p.name}
          </a>
        ),
      )}
      {extra > 0 && providerLink ? (
        <a
          href={providerLink}
          target="_blank"
          rel="noreferrer"
          className="rounded-[0.25rem] px-1.5 py-0.5 text-ink-faint hover:text-ink"
        >
          +{extra} more
        </a>
      ) : null}
      <label className="ml-auto inline-flex items-center">
        <span className="sr-only">Country</span>
        <select
          value={active.code}
          onChange={(e) => setCountry(e.target.value)}
          className="cursor-pointer border-none bg-transparent py-0.5 pl-1.5 pr-1 font-sans text-xs text-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40"
        >
          {data.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
