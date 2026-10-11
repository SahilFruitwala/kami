import "@tanstack/react-start/server-only";
import { z } from "zod";
import { TRIP_SLOTS } from "@/lib/schema";
import { generateJson } from "@/server/ai";
import { badRequest } from "@/server/http";
import { articleDocument, loadArticleForAi } from "@/server/services/ai-articles";
import {
  addTripHotel,
  addTripItem,
  createHotelInput,
  createItemInput,
  createTrip,
  createTripInput,
  updateTrip,
  updateTripInput,
} from "@/server/services/trips";

/**
 * "Plan a trip from this": turn a saved travel piece (a city guide, an
 * itinerary, a "48 hours in…") into a draft trip on the trips board. The
 * model extracts places and plans; everything goes through the trips
 * service and its validation, like the trip agent's writes.
 */

const MAX_DAYS = 14;
const MAX_ITEMS = 40;
const MAX_HOTELS = 5;

const tripSchema = z.object({
  isTravel: z
    .boolean()
    .describe("True only when the piece describes places to visit somewhere specific."),
  destination: z.string().describe("City or region, e.g. 'Lisbon, Portugal'."),
  title: z.string().describe("A short trip name, e.g. 'Lisbon long weekend'."),
  dayCount: z.number().int().describe(`Days the plan covers, 1 to ${MAX_DAYS}.`),
  preferences: z
    .string()
    .describe("One or two sentences on the trip's style from the piece (pace, food, budget)."),
  days: z
    .array(
      z.object({
        day: z.number().int().describe("1-based day number."),
        items: z.array(
          z.object({
            slot: z.enum(TRIP_SLOTS),
            title: z.string().describe("What to do, e.g. 'Coffee at Fábrica'."),
            place: z.string().describe("Place name as written, or empty."),
            notes: z.string().describe("A useful tip from the piece, or empty."),
          }),
        ),
      }),
    )
    .describe("Spread the piece's recommendations over the days in a sensible order."),
  hotels: z
    .array(
      z.object({
        name: z.string(),
        area: z.string().describe("Neighbourhood, or empty."),
        why: z.string().describe("Why the piece recommends it, or empty."),
      }),
    )
    .describe("Hotels the piece itself recommends; empty when it names none."),
});

const blank = (v: string) => v.trim() || undefined;

export async function tripFromArticle(
  userId: string,
  articleId: string,
): Promise<{ tripId: string; items: number; hotels: number }> {
  const article = await loadArticleForAi(userId, articleId);
  const { output } = await generateJson(tripSchema, {
    instructions: [
      "You turn a saved travel article into a draft trip itinerary.",
      "Use only places and tips from the article; don't invent venues.",
      "If the article isn't about visiting a specific place, set isTravel to false and leave the rest minimal.",
    ].join("\n"),
    prompt: articleDocument(article),
    maxOutputTokens: 3000,
  });
  if (!output.isTravel || !output.destination.trim()) {
    throw badRequest("This doesn't read like a travel piece, so there's no trip to plan from it.");
  }

  // Cover every day the plan uses, even when the stated count is lower.
  const lastDay = Math.max(0, ...output.days.map((d) => d.day));
  const dayCount = Math.min(Math.max(1, output.dayCount, lastDay), MAX_DAYS);
  const trip = await createTrip(
    userId,
    createTripInput.parse({
      destination: output.destination.trim().slice(0, 120),
      title: output.title.trim().slice(0, 120) || undefined,
      dayCount,
    }),
  );
  const notes = [output.preferences.trim(), `Planned from “${article.title}” (${article.url}).`]
    .filter(Boolean)
    .join("\n\n");
  await updateTrip(userId, trip.id, updateTripInput.parse({ preferences: notes.slice(0, 2000) }));

  // Add plans one by one through the board's own validation; skip any that fail it.
  let items = 0;
  for (const day of output.days) {
    const dayIndex = Math.min(Math.max(0, day.day - 1), dayCount - 1);
    for (const item of day.items) {
      if (items >= MAX_ITEMS) break;
      const parsed = createItemInput.safeParse({
        dayIndex,
        slot: item.slot,
        title: item.title.trim().slice(0, 200),
        place: blank(item.place)?.slice(0, 200),
        notes: blank(item.notes)?.slice(0, 2000),
      });
      if (!parsed.success) continue;
      await addTripItem(userId, trip.id, parsed.data);
      items++;
    }
  }
  let hotels = 0;
  for (const hotel of output.hotels.slice(0, MAX_HOTELS)) {
    const parsed = createHotelInput.safeParse({
      name: hotel.name.trim().slice(0, 200),
      area: blank(hotel.area)?.slice(0, 120),
      why: blank(hotel.why)?.slice(0, 1000),
    });
    if (!parsed.success) continue;
    await addTripHotel(userId, trip.id, parsed.data);
    hotels++;
  }
  return { tripId: trip.id, items, hotels };
}
