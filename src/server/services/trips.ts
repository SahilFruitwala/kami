import "@tanstack/react-start/server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Trip, TripHotel, TripItem, TripSummary } from "@/lib/api/trips";
import { getDb, type AppDb } from "@/lib/db";
import { assertPublicHttpUrl } from "@/lib/safe-url.ts";
import {
  TRIP_HOTEL_STATUSES,
  TRIP_SLOTS,
  tripHotels,
  tripItems,
  trips,
  type TripHotelRow,
  type TripItemRow,
  type TripRow,
  type TripSlot,
} from "@/lib/schema";
import { uid } from "@/lib/store";
import {
  compareItems,
  daysBetween,
  lastUsedDay,
  MAX_TRIP_DAYS,
  moveWithin,
  parseIsoDate,
} from "@/lib/trip-days.ts";
import { badRequest, notFound } from "@/server/http";

/**
 * Trips: a private plan per user — details, a hotel shortlist, and a
 * day-by-day itinerary. Every write returns the whole updated trip, so the
 * board (and later the trip agent) always works from one fresh snapshot.
 */

export const MAX_TRIPS = 50;
export const MAX_HOTELS = 30;
export const MAX_ITEMS = 300;

// ---------- Schemas ----------

const id = z.string().min(1).max(200);
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

export const tripIdParams = z.object({ id });
export const tripHotelParams = z.object({ id, hotelId: id });
export const tripItemParams = z.object({ id, itemId: id });

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

const hotelFields = {
  area: text(120),
  url: text(2000),
  priceNote: text(200),
  ratingNote: text(200),
  why: text(1000),
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
};

export const createItemInput = z.object({
  dayIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_TRIP_DAYS - 1),
  slot: z.enum(TRIP_SLOTS),
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
  slot: z.enum(TRIP_SLOTS).optional(),
  title: z.string().trim().min(1, "Describe the plan.").max(200).optional(),
  ...itemFields,
});

// ---------- Mapping ----------

/** `undefined` stays undefined (no change); "" becomes null. */
const clean = (value: string | null | undefined) =>
  value === undefined ? undefined : value?.trim() || null;

function cleanUrl(value: string | null | undefined): string | null | undefined {
  const raw = clean(value);
  if (!raw) return raw;
  try {
    return assertPublicHttpUrl(raw.includes("://") ? raw : `https://${raw}`).href;
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "That link can't be used.");
  }
}

function toHotel(row: TripHotelRow): TripHotel {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    url: row.url,
    priceNote: row.priceNote,
    ratingNote: row.ratingNote,
    why: row.why,
    status: row.status,
    createdAt: row.createdAt.getTime(),
  };
}

function toItem(row: TripItemRow): TripItem {
  return {
    id: row.id,
    dayIndex: row.dayIndex,
    slot: row.slot,
    title: row.title,
    place: row.place,
    url: row.url,
    notes: row.notes,
    sort: row.sort,
    createdAt: row.createdAt.getTime(),
  };
}

function toTrip(row: TripRow, hotels: TripHotelRow[], items: TripItemRow[]): Trip {
  return {
    id: row.id,
    title: row.title,
    destination: row.destination,
    startDate: row.startDate,
    dayCount: row.dayCount,
    travelers: row.travelers,
    budget: row.budget,
    preferences: row.preferences,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    hotels: hotels.map(toHotel),
    items: items.map(toItem).sort(compareItems),
  };
}

/** Resolve the trip length from an explicit count or an end date. */
function resolveDayCount(
  startDate: string | null | undefined,
  endDate: string | undefined,
  count: number | undefined,
): number | undefined {
  if (count !== undefined) return count;
  if (endDate === undefined) return undefined;
  if (!startDate) throw badRequest("Set a start date before an end date.");
  const days = daysBetween(startDate, endDate);
  if (days === null) throw badRequest("The end date must be on or after the start date.");
  if (days > MAX_TRIP_DAYS) throw badRequest(`Trips can be up to ${MAX_TRIP_DAYS} days.`);
  return days;
}

async function ownedTrip(db: AppDb, userId: string, tripId: string): Promise<TripRow> {
  const [row] = await db
    .select()
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .limit(1);
  if (!row) throw notFound("That trip no longer exists.");
  return row;
}

async function loadTrip(db: AppDb, row: TripRow): Promise<Trip> {
  const hotels = await db
    .select()
    .from(tripHotels)
    .where(eq(tripHotels.tripId, row.id))
    .orderBy(asc(tripHotels.sort), asc(tripHotels.createdAt));
  const items = await db.select().from(tripItems).where(eq(tripItems.tripId, row.id));
  return toTrip(row, hotels, items);
}

/** Bump `updated_at` after a child change and return the fresh trip. */
async function touchAndLoad(db: AppDb, userId: string, tripId: string): Promise<Trip> {
  const [row] = await db
    .update(trips)
    .set({ updatedAt: new Date() })
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .returning();
  if (!row) throw notFound("That trip no longer exists.");
  return loadTrip(db, row);
}

// ---------- Trips ----------

export async function listTrips(userId: string): Promise<TripSummary[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(trips)
    .where(eq(trips.userId, userId))
    .orderBy(sql`${trips.updatedAt} DESC`, trips.id);
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const hotelCounts = await db
    .select({
      tripId: tripHotels.tripId,
      n: sql<number>`count(*)::int`,
      chosen: sql<
        string | null
      >`max(${tripHotels.name}) FILTER (WHERE ${tripHotels.status} = 'chosen')`,
    })
    .from(tripHotels)
    .where(inArray(tripHotels.tripId, ids))
    .groupBy(tripHotels.tripId);
  const itemCounts = await db
    .select({ tripId: tripItems.tripId, n: sql<number>`count(*)::int` })
    .from(tripItems)
    .where(inArray(tripItems.tripId, ids))
    .groupBy(tripItems.tripId);

  const hotelsBy = new Map(hotelCounts.map((h) => [h.tripId, h]));
  const itemsBy = new Map(itemCounts.map((i) => [i.tripId, Number(i.n) || 0]));
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    destination: row.destination,
    startDate: row.startDate,
    dayCount: row.dayCount,
    hotelCount: Number(hotelsBy.get(row.id)?.n) || 0,
    itemCount: itemsBy.get(row.id) ?? 0,
    chosenHotel: hotelsBy.get(row.id)?.chosen ?? null,
    updatedAt: row.updatedAt.getTime(),
  }));
}

export async function getTrip(userId: string, tripId: string): Promise<Trip> {
  const db = await getDb();
  return loadTrip(db, await ownedTrip(db, userId, tripId));
}

export async function createTrip(
  userId: string,
  input: z.output<typeof createTripInput>,
): Promise<Trip> {
  const db = await getDb();
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trips)
    .where(eq(trips.userId, userId));
  if ((count?.n ?? 0) >= MAX_TRIPS) {
    throw badRequest(`You can keep up to ${MAX_TRIPS} trips. Delete an old one first.`);
  }
  const startDate = input.startDate ?? null;
  const days = resolveDayCount(startDate, input.endDate, input.dayCount) ?? 3;
  const [row] = await db
    .insert(trips)
    .values({
      id: uid(),
      userId,
      title: input.title || input.destination,
      destination: input.destination,
      startDate,
      dayCount: days,
    })
    .returning();
  return toTrip(row, [], []);
}

export async function updateTrip(
  userId: string,
  tripId: string,
  input: z.output<typeof updateTripInput>,
): Promise<Trip> {
  const db = await getDb();
  const current = await ownedTrip(db, userId, tripId);
  const startDate = input.startDate !== undefined ? input.startDate : current.startDate;
  const days = resolveDayCount(startDate, input.endDate, input.dayCount);

  if (days !== undefined && days < current.dayCount) {
    const items = await db
      .select({ dayIndex: tripItems.dayIndex })
      .from(tripItems)
      .where(eq(tripItems.tripId, tripId));
    const last = lastUsedDay(items);
    if (last >= days) {
      throw badRequest(
        `Day ${last + 1} still has plans. Move or delete them before shortening the trip.`,
      );
    }
  }

  const [row] = await db
    .update(trips)
    .set({
      title: input.title,
      destination: input.destination,
      startDate: input.startDate,
      dayCount: days,
      travelers: input.travelers,
      budget: clean(input.budget),
      preferences: clean(input.preferences),
      updatedAt: new Date(),
    })
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .returning();
  if (!row) throw notFound("That trip no longer exists.");
  return loadTrip(db, row);
}

export async function deleteTrip(userId: string, tripId: string): Promise<void> {
  const db = await getDb();
  const deleted = await db
    .delete(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .returning({ id: trips.id });
  if (!deleted.length) throw notFound("That trip no longer exists.");
}

// ---------- Hotels ----------

export async function addTripHotel(
  userId: string,
  tripId: string,
  input: z.output<typeof createHotelInput>,
): Promise<Trip> {
  const db = await getDb();
  await ownedTrip(db, userId, tripId);
  const [stats] = await db
    .select({
      n: sql<number>`count(*)::int`,
      maxSort: sql<number>`coalesce(max(${tripHotels.sort}), -1)::int`,
    })
    .from(tripHotels)
    .where(eq(tripHotels.tripId, tripId));
  if ((stats?.n ?? 0) >= MAX_HOTELS) {
    throw badRequest(`A trip can shortlist up to ${MAX_HOTELS} hotels.`);
  }
  await db.insert(tripHotels).values({
    id: uid(),
    tripId,
    userId,
    name: input.name,
    area: clean(input.area) ?? null,
    url: cleanUrl(input.url) ?? null,
    priceNote: clean(input.priceNote) ?? null,
    ratingNote: clean(input.ratingNote) ?? null,
    why: clean(input.why) ?? null,
    sort: (stats?.maxSort ?? -1) + 1,
  });
  return touchAndLoad(db, userId, tripId);
}

export async function updateTripHotel(
  userId: string,
  tripId: string,
  hotelId: string,
  input: z.output<typeof updateHotelInput>,
): Promise<Trip> {
  const db = await getDb();
  await ownedTrip(db, userId, tripId);
  const scope = and(
    eq(tripHotels.id, hotelId),
    eq(tripHotels.tripId, tripId),
    eq(tripHotels.userId, userId),
  );
  await db.transaction(async (tx) => {
    // Only one chosen hotel per trip (also enforced by a partial unique index).
    if (input.status === "chosen") {
      await tx
        .update(tripHotels)
        .set({ status: "shortlisted" })
        .where(
          and(
            eq(tripHotels.tripId, tripId),
            eq(tripHotels.status, "chosen"),
            ne(tripHotels.id, hotelId),
          ),
        );
    }
    const updated = await tx
      .update(tripHotels)
      .set({
        name: input.name,
        area: clean(input.area),
        url: cleanUrl(input.url),
        priceNote: clean(input.priceNote),
        ratingNote: clean(input.ratingNote),
        why: clean(input.why),
        status: input.status,
      })
      .where(scope)
      .returning({ id: tripHotels.id });
    if (!updated.length) throw notFound("That hotel is no longer on this trip.");
  });
  return touchAndLoad(db, userId, tripId);
}

export async function removeTripHotel(
  userId: string,
  tripId: string,
  hotelId: string,
): Promise<Trip> {
  const db = await getDb();
  await ownedTrip(db, userId, tripId);
  const deleted = await db
    .delete(tripHotels)
    .where(
      and(eq(tripHotels.id, hotelId), eq(tripHotels.tripId, tripId), eq(tripHotels.userId, userId)),
    )
    .returning({ id: tripHotels.id });
  if (!deleted.length) throw notFound("That hotel is no longer on this trip.");
  return touchAndLoad(db, userId, tripId);
}

// ---------- Itinerary ----------

function assertDayInTrip(trip: TripRow, dayIndex: number) {
  if (dayIndex >= trip.dayCount) {
    throw badRequest(`This trip has ${trip.dayCount} days. Pick day 1–${trip.dayCount}.`);
  }
}

/** Next sort value at the end of one day + slot. */
async function nextSort(db: AppDb, tripId: string, dayIndex: number, slot: TripSlot) {
  const [row] = await db
    .select({ maxSort: sql<number>`coalesce(max(${tripItems.sort}), -1)::int` })
    .from(tripItems)
    .where(
      and(eq(tripItems.tripId, tripId), eq(tripItems.dayIndex, dayIndex), eq(tripItems.slot, slot)),
    );
  return (row?.maxSort ?? -1) + 1;
}

export async function addTripItem(
  userId: string,
  tripId: string,
  input: z.output<typeof createItemInput>,
): Promise<Trip> {
  const db = await getDb();
  const trip = await ownedTrip(db, userId, tripId);
  assertDayInTrip(trip, input.dayIndex);
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tripItems)
    .where(eq(tripItems.tripId, tripId));
  if ((count?.n ?? 0) >= MAX_ITEMS) {
    throw badRequest(`A trip can hold up to ${MAX_ITEMS} plans.`);
  }
  await db.insert(tripItems).values({
    id: uid(),
    tripId,
    userId,
    dayIndex: input.dayIndex,
    slot: input.slot,
    title: input.title,
    place: clean(input.place) ?? null,
    url: cleanUrl(input.url) ?? null,
    notes: clean(input.notes) ?? null,
    sort: await nextSort(db, tripId, input.dayIndex, input.slot),
  });
  return touchAndLoad(db, userId, tripId);
}

export async function updateTripItem(
  userId: string,
  tripId: string,
  itemId: string,
  input: z.output<typeof updateItemInput>,
): Promise<Trip> {
  const db = await getDb();
  const trip = await ownedTrip(db, userId, tripId);
  const scope = and(
    eq(tripItems.id, itemId),
    eq(tripItems.tripId, tripId),
    eq(tripItems.userId, userId),
  );
  const [current] = await db.select().from(tripItems).where(scope).limit(1);
  if (!current) throw notFound("That plan is no longer on this trip.");

  const dayIndex = input.dayIndex ?? current.dayIndex;
  const slot = input.slot ?? current.slot;
  assertDayInTrip(trip, dayIndex);
  // Moving to another day or slot puts the item at the end of its new spot.
  const moved = dayIndex !== current.dayIndex || slot !== current.slot;

  await db
    .update(tripItems)
    .set({
      dayIndex,
      slot,
      title: input.title,
      place: clean(input.place),
      url: cleanUrl(input.url),
      notes: clean(input.notes),
      sort: moved ? await nextSort(db, tripId, dayIndex, slot) : undefined,
    })
    .where(scope);
  return touchAndLoad(db, userId, tripId);
}

export async function removeTripItem(
  userId: string,
  tripId: string,
  itemId: string,
): Promise<Trip> {
  const db = await getDb();
  await ownedTrip(db, userId, tripId);
  const deleted = await db
    .delete(tripItems)
    .where(
      and(eq(tripItems.id, itemId), eq(tripItems.tripId, tripId), eq(tripItems.userId, userId)),
    )
    .returning({ id: tripItems.id });
  if (!deleted.length) throw notFound("That plan is no longer on this trip.");
  return touchAndLoad(db, userId, tripId);
}

export const moveItemInput = z.object({ direction: z.enum(["up", "down"]) });

/** Swap a plan with its neighbour inside the same day + slot. */
export async function moveTripItem(
  userId: string,
  tripId: string,
  itemId: string,
  direction: "up" | "down",
): Promise<Trip> {
  const db = await getDb();
  await ownedTrip(db, userId, tripId);
  const [current] = await db
    .select()
    .from(tripItems)
    .where(and(eq(tripItems.id, itemId), eq(tripItems.tripId, tripId)))
    .limit(1);
  if (!current) throw notFound("That plan is no longer on this trip.");

  const siblings = await db
    .select({ id: tripItems.id })
    .from(tripItems)
    .where(
      and(
        eq(tripItems.tripId, tripId),
        eq(tripItems.dayIndex, current.dayIndex),
        eq(tripItems.slot, current.slot),
      ),
    )
    .orderBy(asc(tripItems.sort), asc(tripItems.id));
  const order = moveWithin(
    siblings.map((s) => s.id),
    itemId,
    direction,
  );
  // Already first / last: nothing to change.
  if (!order) return loadTrip(db, await ownedTrip(db, userId, tripId));

  await db.transaction(async (tx) => {
    for (const [sort, id] of order.entries()) {
      await tx.update(tripItems).set({ sort }).where(eq(tripItems.id, id));
    }
  });
  return touchAndLoad(db, userId, tripId);
}

export const replaceDayInput = z.object({
  dayIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_TRIP_DAYS - 1),
  items: z
    .array(createItemInput.omit({ dayIndex: true }))
    .max(20, "Keep one day to 20 plans or fewer."),
});

/** Replace every item on one day in a single transaction (used by the trip agent). */
export async function replaceTripDay(
  userId: string,
  tripId: string,
  input: z.output<typeof replaceDayInput>,
): Promise<Trip> {
  const db = await getDb();
  const trip = await ownedTrip(db, userId, tripId);
  assertDayInTrip(trip, input.dayIndex);
  const rows = input.items.map((item, i) => ({
    id: uid(),
    tripId,
    userId,
    dayIndex: input.dayIndex,
    slot: item.slot,
    title: item.title,
    place: clean(item.place) ?? null,
    url: cleanUrl(item.url) ?? null,
    notes: clean(item.notes) ?? null,
    sort: i,
  }));
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tripItems)
    .where(and(eq(tripItems.tripId, tripId), ne(tripItems.dayIndex, input.dayIndex)));
  if ((count?.n ?? 0) + rows.length > MAX_ITEMS) {
    throw badRequest(`A trip can hold up to ${MAX_ITEMS} plans.`);
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(tripItems)
      .where(and(eq(tripItems.tripId, tripId), eq(tripItems.dayIndex, input.dayIndex)));
    if (rows.length) await tx.insert(tripItems).values(rows);
  });
  return touchAndLoad(db, userId, tripId);
}
