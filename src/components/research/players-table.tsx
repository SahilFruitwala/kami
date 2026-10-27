import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PlayerView } from "@/lib/api/research.ts";
import { cn } from "@/lib/utils.ts";

type SortKey = "name" | "category" | "complaints" | "freePlan";

function pricingLabel(player: PlayerView): string {
  if (!player.pricing.plans.length) return player.freePlan ? "Free plan" : "—";
  return player.pricing.plans.map((p) => (p.price ? `${p.name} ${p.price}` : p.name)).join(" · ");
}

/**
 * Players tab: a sortable table grouped by category. Complaint counts come
 * from linked evidence; empty fields mean no fetched homepage/pricing yet.
 */
export function PlayersTable({ players }: { players: PlayerView[] }) {
  const [sort, setSort] = useState<SortKey>("category");
  const [dir, setDir] = useState<1 | -1>(1);

  function toggle(key: SortKey) {
    if (sort === key) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSort(key);
      setDir(1);
    }
  }

  const grouped = useMemo(() => {
    const sorted = [...players].sort((a, b) => {
      const cmp =
        sort === "complaints"
          ? a.complaints - b.complaints
          : sort === "freePlan"
            ? Number(a.freePlan) - Number(b.freePlan)
            : (a[sort] || "Uncategorised").localeCompare(b[sort] || "Uncategorised");
      return cmp === 0 ? a.name.localeCompare(b.name) : cmp * dir;
    });
    const groups: Array<{ category: string; rows: PlayerView[] }> = [];
    for (const p of sorted) {
      const category = p.category.trim() || "Uncategorised";
      const last = groups[groups.length - 1];
      if (last && last.category === category) last.rows.push(p);
      else groups.push({ category, rows: [p] });
    }
    return groups;
  }, [players, sort, dir]);

  const Th = ({ id, label }: { id: SortKey; label: string }) => (
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={() => toggle(id)}
        className={cn(
          "font-sans text-[11px] font-semibold tracking-wide uppercase",
          sort === id ? "text-ink" : "text-ink-muted",
        )}
      >
        {label}
        {sort === id ? (dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <Th id="name" label="Player" />
            <Th id="category" label="Category" />
            <Th id="complaints" label="Complaints" />
            <Th id="freePlan" label="Free" />
            <th className="px-3 py-2 font-sans text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              Pricing
            </th>
          </tr>
        </thead>
        <tbody>
          {grouped.map((g) => (
            <Group key={g.category} category={g.category} rows={g.rows} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Group({ category, rows }: { category: string; rows: PlayerView[] }) {
  return (
    <>
      <tr className="bg-paper-warm/60">
        <th
          colSpan={5}
          className="px-3 py-1.5 font-sans text-[11px] font-semibold tracking-wide text-ink-soft uppercase"
        >
          {category}
        </th>
      </tr>
      {rows.map((p) => (
        <tr key={p.id} className="border-b border-line align-top">
          <td className="px-3 py-2.5">
            <div className="flex flex-col gap-0.5">
              {p.url ? (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-body text-sm text-ink hover:text-hanko"
                >
                  {p.name}
                  <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                </a>
              ) : (
                <span className="font-body text-sm text-ink">{p.name}</span>
              )}
              {p.oneLiner ? (
                <span className="font-body text-xs text-ink-soft">{p.oneLiner}</span>
              ) : null}
              {p.audience ? (
                <span className="font-sans text-[11px] text-ink-muted">{p.audience}</span>
              ) : null}
            </div>
          </td>
          <td className="px-3 py-2.5 font-sans text-xs text-ink-soft">{p.category || "—"}</td>
          <td className="px-3 py-2.5 font-sans text-xs text-ink-soft">{p.complaints}</td>
          <td className="px-3 py-2.5 font-sans text-xs text-ink-soft">
            {p.freePlan ? "Yes" : "—"}
          </td>
          <td className="px-3 py-2.5 font-sans text-xs text-ink-soft">{pricingLabel(p)}</td>
        </tr>
      ))}
    </>
  );
}
