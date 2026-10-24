import { TRIP_STATUS_LABEL, TRIP_STATUSES, type TripStatus } from "@/lib/trip-days.ts";
import { cn } from "@/lib/utils.ts";

/** Status is a plain label: set by hand, in any direction. */
export function StatusSelect({
  value,
  onChange,
  label,
  disabled,
  className,
}: {
  value: TripStatus;
  onChange: (status: TripStatus) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as TripStatus)}
      className={cn(
        "h-8 rounded-full border border-line bg-surface px-3 font-sans text-xs text-ink-soft transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:outline-none disabled:opacity-50",
        className,
      )}
    >
      {TRIP_STATUSES.map((s) => (
        <option key={s} value={s}>
          {TRIP_STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
