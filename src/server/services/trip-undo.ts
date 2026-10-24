import "@tanstack/react-start/server-only";
import { and, eq } from "drizzle-orm";
import type { Trip } from "@/lib/api/trips";
import { getDb } from "@/lib/db.server";
import { tripHotels, tripItems, tripSnapshots, trips } from "@/lib/schema";
import { badRequest, notFound } from "@/server/http";
import { getTrip } from "@/server/services/trips";

/**
 * One undo point per trip for the trip agent. The agent saves the trip before
 * its first write in a turn; `undoTripChanges` puts that copy back (details,
 * hotels and itinerary, with their original ids) and forgets it.
 */

export async function saveTripSnapshot(userId: string, tripId: string): Promise<void> {
  const trip = await getTrip(userId, tripId);
  const db = await getDb();
  await db
    .insert(tripSnapshots)
    .values({ tripId, userId, snapshot: trip })
    .onConflictDoUpdate({
      target: tripSnapshots.tripId,
      set: { snapshot: trip, createdAt: new Date() },
    });
}

export async function hasTripSnapshot(userId: string, tripId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ tripId: tripSnapshots.tripId })
    .from(tripSnapshots)
    .where(and(eq(tripSnapshots.tripId, tripId), eq(tripSnapshots.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function undoTripChanges(userId: string, tripId: string): Promise<Trip> {
  const db = await getDb();
  await getTrip(userId, tripId); // ownership + existence
  const [saved] = await db
    .select()
    .from(tripSnapshots)
    .where(and(eq(tripSnapshots.tripId, tripId), eq(tripSnapshots.userId, userId)))
    .limit(1);
  if (!saved) throw badRequest("There is nothing to undo.");
  const before = saved.snapshot as Trip;

  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(trips)
      .set({
        title: before.title,
        destination: before.destination,
        startDate: before.startDate,
        dayCount: before.dayCount,
        travelers: before.travelers,
        budget: before.budget,
        preferences: before.preferences,
        updatedAt: new Date(),
      })
      .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
      .returning({ id: trips.id });
    if (!row) throw notFound("That trip no longer exists.");

    await tx.delete(tripHotels).where(eq(tripHotels.tripId, tripId));
    await tx.delete(tripItems).where(eq(tripItems.tripId, tripId));
    if (before.hotels.length) {
      await tx.insert(tripHotels).values(
        before.hotels.map((h, sort) => ({
          id: h.id,
          tripId,
          userId,
          name: h.name,
          area: h.area,
          url: h.url,
          priceNote: h.priceNote,
          ratingNote: h.ratingNote,
          why: h.why,
          // Snapshots from before map pins existed have no coordinates.
          lat: h.lat ?? null,
          lng: h.lng ?? null,
          status: h.status,
          sort,
          createdAt: new Date(h.createdAt),
        })),
      );
    }
    if (before.items.length) {
      await tx.insert(tripItems).values(
        before.items.map((i) => ({
          id: i.id,
          tripId,
          userId,
          dayIndex: i.dayIndex,
          slot: i.slot,
          title: i.title,
          place: i.place,
          url: i.url,
          notes: i.notes,
          lat: i.lat ?? null,
          lng: i.lng ?? null,
          startTime: i.startTime ?? null,
          durationMin: i.durationMin ?? null,
          sort: i.sort,
          createdAt: new Date(i.createdAt),
        })),
      );
    }
    await tx.delete(tripSnapshots).where(eq(tripSnapshots.tripId, tripId));
  });
  return getTrip(userId, tripId);
}
