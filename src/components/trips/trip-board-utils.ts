import { useTripActions } from "@/hooks/use-trips.ts";
import type { TripSlot } from "@/lib/api/trips";
import { SLOT_ORDER } from "@/lib/trip-days.ts";
import { formatDuration } from "@/lib/trip-route.ts";

export type Actions = ReturnType<typeof useTripActions>;

export const SLOT_LABEL: Record<TripSlot, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

/** "" → null so cleared fields clear on the server. */
export const orNull = (value: string) => value.trim() || null;

export const SLOT_OPTIONS = SLOT_ORDER.map((s) => ({ value: s, label: SLOT_LABEL[s] }));

export const DURATION_OPTIONS = [
  { value: "", label: "—" },
  ...[15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480].map((m) => ({
    value: String(m),
    label: formatDuration(m),
  })),
];
