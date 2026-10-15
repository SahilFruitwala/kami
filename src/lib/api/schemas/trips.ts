import { z } from "zod";
import { MAX_TRIP_DAYS, SLOT_ORDER, TRIP_HOTEL_STATUSES, parseIsoDate } from "@/lib/trip-days";

/**
 * Trip request bodies. The server validates with these; the browser client
 * derives its request types from them (`import type` + `z.input`).
 */

/** Optional text: `undefined` leaves a field alone, `null` or "" clears it. */
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDate = z
  .string()
  .trim()
  .refine((v) => parseIsoDate(v) !== null, "Use a real date (YYYY-MM-DD).");
const dayCount = z
  .number()
  .int()
  .min(1)
  .max(MAX_TRIP_DAYS, `Trips can be up to ${MAX_TRIP_DAYS} days.`);

export const createTripInput = z.object({
  destination: z.string().trim().min(1, "Where are you going?").max(120),
  title: z.string().trim().max(120).optional(),
  startDate: isoDate.nullable().optional(),
  /** Alternative to `dayCount`: the last day of the trip (inclusive). */
  endDate: isoDate.optional(),
  dayCount: dayCount.optional(),
});

export const updateTripInput = z.object({
  title: z.string().trim().min(1, "Give the trip a name.").max(120).optional(),
  destination: z.string().trim().min(1, "Where are you going?").max(120).optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.optional(),
  dayCount: dayCount.optional(),
  travelers: z.number().int().min(1).max(20).nullable().optional(),
  budget: text(200),
  preferences: text(2000),
});

const lat = z.number().min(-90).max(90).nullable().optional();
const lng = z.number().min(-180).max(180).nullable().optional();
const startTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:30.")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));
const durationMin = z
  .number()
  .int()
  .min(5, "Make it at least 5 minutes.")
  .max(1440, "Keep a plan to one day or less.")
  .nullable()
  .optional();

const hotelFields = {
  area: text(120),
  url: text(2000),
  priceNote: text(200),
  ratingNote: text(200),
  why: text(1000),
  lat,
  lng,
};

export const createHotelInput = z.object({
  name: z.string().trim().min(1, "Name the hotel.").max(200),
  ...hotelFields,
});

export const updateHotelInput = z.object({
  name: z.string().trim().min(1, "Name the hotel.").max(200).optional(),
  ...hotelFields,
  status: z.enum(TRIP_HOTEL_STATUSES).optional(),
});

const itemFields = {
  place: text(200),
  url: text(2000),
  notes: text(2000),
  lat,
  lng,
  startTime,
  durationMin,
};

export const createItemInput = z.object({
  dayIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_TRIP_DAYS - 1),
  slot: z.enum(SLOT_ORDER),
  title: z.string().trim().min(1, "Describe the plan.").max(200),
  ...itemFields,
});

export const updateItemInput = z.object({
  dayIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_TRIP_DAYS - 1)
    .optional(),
  slot: z.enum(SLOT_ORDER).optional(),
  title: z.string().trim().min(1, "Describe the plan.").max(200).optional(),
  ...itemFields,
});
