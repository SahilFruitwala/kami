import "@tanstack/react-start/server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { TripLocateResult } from "@/lib/api/trips";
import { getDb } from "@/lib/db";
import { geocode } from "@/lib/geocode.server.ts";
import { enforceRateLimit } from "@/lib/rate-limit.server.ts";
import { tripHotels, tripItems, trips } from "@/lib/schema";
import { HttpError, notFound } from "@/server/http";
import { getTrip } from "@/server/services/trips";

/**
 * "Find on map": geocode plans and hotels that name a place but have no pin.
 * Nominatim's public instance allows about one request per second, so one
 * call handles a small batch, spaced out, and reports how many are left.
 */

/** Lookups per call; keeps one request well under typical function timeouts. */
export const LOCATE_BATCH = 6;
const SPACING_MS = 1_100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const locateInput = z.object({
  /** Ids this client already looked up without a match; skipped so the rest get a turn. */
  skip: z.array(z.string().max(200)).max(400).optional(),
});

type Target = { kind: "item" | "hotel"; id: string; query: string };

export async function locateTripPlaces(
  userId: string,
  tripId: string,
  input: z.output<typeof locateInput> = {},
): Promise<TripLocateResult> {
  const skip = new Set(input.skip ?? []);
  const db = await getDb();
  const [trip] = await db
    .select({ destination: trips.destination })
    .from(trips)
    .where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
    .limit(1);
  if (!trip) throw notFound("That trip no longer exists.");

  const within = (text: string) => `${text}, ${trip.destination}`;
  const hotels = await db
    .select({ id: tripHotels.id, name: tripHotels.name, area: tripHotels.area })
    .from(tripHotels)
    .where(and(eq(tripHotels.tripId, tripId), isNull(tripHotels.lat)));
  const items = await db
    .select({ id: tripItems.id, place: tripItems.place })
    .from(tripItems)
    .where(and(eq(tripItems.tripId, tripId), isNull(tripItems.lat)));

  // Plans need a place to look up; a bare title ("Lunch") would pin nonsense.
  const targets: Target[] = [
    ...hotels.map((h) => ({
      kind: "hotel" as const,
      id: h.id,
      query: within([h.name, h.area].filter(Boolean).join(", ")),
    })),
    ...items.flatMap((i) =>
      i.place ? [{ kind: "item" as const, id: i.id, query: within(i.place) }] : [],
    ),
  ];

  const pending = targets.filter((t) => !skip.has(t.id));
  const batch = pending.slice(0, LOCATE_BATCH);
  if (batch.length) await enforceRateLimit(userId, "lookup", batch.length);

  let found = 0;
  const missedIds: string[] = [];
  const seen = new Map<string, { lat: number; lng: number } | null>();
  for (const [i, target] of batch.entries()) {
    let hit = seen.get(target.query);
    if (hit === undefined) {
      if (i > 0) await sleep(SPACING_MS);
      try {
        hit = await geocode(target.query);
      } catch (err) {
        console.error("[trips] geocode failed:", err);
        if (found + missedIds.length === 0) {
          throw new HttpError(502, "The map lookup service isn't answering. Try again later.");
        }
        break;
      }
      seen.set(target.query, hit);
    }
    if (!hit) {
      // Left unpinned; a corrected place is retried on a later visit.
      missedIds.push(target.id);
      continue;
    }
    found += 1;
    if (target.kind === "hotel") {
      await db
        .update(tripHotels)
        .set(hit)
        .where(and(eq(tripHotels.id, target.id), eq(tripHotels.tripId, tripId)));
    } else {
      await db
        .update(tripItems)
        .set(hit)
        .where(and(eq(tripItems.id, target.id), eq(tripItems.tripId, tripId)));
    }
  }

  return {
    trip: await getTrip(userId, tripId),
    found,
    missedIds,
    remaining: Math.max(0, pending.length - batch.length),
  };
}
