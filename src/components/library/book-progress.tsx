import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useBookPageCountLookup, useSetBookProgress } from "@/hooks/use-shelf-queries.ts";
import { cn } from "@/lib/utils.ts";
import { toastError } from "@/lib/errors";

type Mode = "pages" | "percent";

/**
 * Reading progress for one book — by page ("120 of 340") or by percent.
 * The parent keys this by the saved values so the form resets after a save.
 */
export function BookProgress({
  id,
  currentPage,
  pageCount,
  percent,
}: {
  id: string;
  currentPage: number | null;
  pageCount: number | null;
  percent: number;
}) {
  const save = useSetBookProgress();
  const lookup = useBookPageCountLookup(id, pageCount == null);
  const lookingUp = pageCount == null && lookup.isFetching;
  const fieldId = useId();
  const [mode, setMode] = useState<Mode>(pageCount ? "pages" : "percent");
  const [page, setPage] = useState(currentPage != null ? String(currentPage) : "");
  const [total, setTotal] = useState(pageCount != null ? String(pageCount) : "");
  const [pct, setPct] = useState(String(percent));
  const [error, setError] = useState("");

  const pageNum = Number.parseInt(page, 10);
  const totalNum = Number.parseInt(total, 10);
  const pctNum = Number.parseInt(pct, 10);
  const previewPercent =
    mode === "pages"
      ? Number.isFinite(pageNum) && totalNum > 0
        ? Math.min(100, Math.round((pageNum / totalNum) * 100))
        : percent
      : Number.isFinite(pctNum)
        ? Math.min(100, Math.max(0, pctNum))
        : percent;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    let data: Parameters<typeof save.mutateAsync>[0];
    if (mode === "pages") {
      if (!(totalNum > 0)) return setError("Enter how many pages the book has.");
      if (!Number.isFinite(pageNum) || pageNum < 0) return setError("Enter the page you're on.");
      if (pageNum > totalNum) return setError(`The book only has ${totalNum} pages.`);
      data = { id, mode, currentPage: pageNum, pageCount: totalNum };
    } else {
      if (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100)
        return setError("Enter a percent from 0 to 100.");
      data = { id, mode, percent: pctNum };
    }
    try {
      const res = await save.mutateAsync(data);
      toast.success(
        res.status === "done"
          ? "Finished — marked read"
          : res.percent === 0
            ? "Progress cleared"
            : `Progress saved · ${res.percent}%`,
      );
    } catch (err) {
      toastError(err, "Couldn't save progress.");
    }
  }

  const summary =
    currentPage != null && pageCount
      ? `Page ${currentPage} of ${pageCount} · ${percent}%`
      : percent > 0
        ? `${percent}%`
        : "Not started";

  return (
    <section aria-labelledby={`${fieldId}-heading`} className="kami-sheet p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${fieldId}-heading`} className="kami-label text-ink-muted">
          Progress
          <span className="ml-2 font-normal tracking-normal normal-case tabular-nums">
            {summary}
          </span>
        </h2>
        <div role="group" aria-label="Track progress by" className="flex gap-1">
          {(["pages", "percent"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setError("");
              }}
              className={cn(
                "min-h-8 rounded-lg px-2.5 font-sans text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hanko/40",
                mode === m
                  ? "bg-paper-warm font-semibold text-ink"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {m === "pages" ? "Pages" : "Percent"}
            </button>
          ))}
        </div>
      </div>

      <span
        className="mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-paper-warm"
        aria-hidden="true"
      >
        <span
          className={cn(
            "block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
            previewPercent >= 100 ? "bg-hanko" : "bg-bamboo",
          )}
          style={{ width: `${previewPercent}%` }}
        />
      </span>

      <form onSubmit={(e) => void onSubmit(e)} className="mt-4 flex flex-wrap items-end gap-3">
        {mode === "pages" ? (
          <div className="flex items-end gap-2 font-sans text-sm text-ink-muted">
            <label className="space-y-1">
              <span className="kami-label block">Page</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={totalNum > 0 ? totalNum : undefined}
                value={page}
                onChange={(e) => setPage(e.target.value)}
                className="w-24 tabular-nums"
                autoComplete="off"
              />
            </label>
            <span className="pb-2.5">of</span>
            <label className="space-y-1">
              <span className="kami-label block">Total pages</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder={lookingUp ? "…" : undefined}
                aria-busy={lookingUp}
                className="w-24 tabular-nums"
                autoComplete="off"
              />
            </label>
          </div>
        ) : (
          <label className="space-y-1 font-sans text-sm text-ink-muted">
            <span className="kami-label block">Percent read</span>
            <span className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Number.isFinite(pctNum) ? pctNum : 0}
                onChange={(e) => setPct(e.target.value)}
                aria-label="Percent read"
                className="w-40 accent-[var(--color-hanko)]"
              />
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                className="w-20 tabular-nums"
                aria-label="Percent read, number"
                autoComplete="off"
              />
              <span>%</span>
            </span>
          </label>
        )}
        <Button
          type="submit"
          disabled={save.isPending}
          className="bg-hanko text-paper hover:bg-shu"
        >
          {save.isPending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          Save progress
        </Button>
      </form>
      {mode === "pages" && pageCount == null && !total && !lookingUp && lookup.isFetched ? (
        <p className="mt-2 font-sans text-xs text-ink-muted">
          Open Library doesn't list a page count for this book — enter it from your copy.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 font-sans text-xs text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
