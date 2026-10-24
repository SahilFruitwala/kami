import type { UIMessage } from "ai";
import type { z } from "zod";
import type { Slot, TripHotelStatus, TripStatus } from "@/lib/trip-days";
import { http, seg } from "./client";
import type {
  createHotelInput,
  createItemInput,
  createTripInput,
  updateHotelInput,
  updateItemInput,
  updateTripInput,
} from "./schemas/trips";

export type TripSlot = Slot;
export type { TripHotelStatus, TripStatus };

export type TripHotel = {
  id: string;
  name: string;
  area: string | null;
  url: string | null;
  /** Free text, e.g. "≈ €140/night (seen on a booking site)" — never live pricing. */
  priceNote: string | null;
  ratingNote: string | null;
  why: string | null;
  status: TripHotelStatus;
  createdAt: number;
};

export type TripItem = {
  id: string;
  /** 0-based day of the trip. */
  dayIndex: number;
  slot: TripSlot;
  title: string;
  place: string | null;
  url: string | null;
  notes: string | null;
  /** "HH:MM" local to the destination; null falls back to the slot's time. */
  startTime: string | null;
  durationMin: number | null;
  sort: number;
  createdAt: number;
};

export type TripSummary = {
  id: string;
  title: string;
  destination: string;
  /** `YYYY-MM-DD`, or null while the dates are undecided. */
  startDate: string | null;
  dayCount: number;
  status: TripStatus;
  hotelCount: number;
  itemCount: number;
  /** Name of the chosen hotel, if any. */
  chosenHotel: string | null;
  updatedAt: number;
};

export type Trip = {
  id: string;
  title: string;
  destination: string;
  startDate: string | null;
  dayCount: number;
  travelers: number | null;
  budget: string | null;
  preferences: string | null;
  status: TripStatus;
  createdAt: number;
  updatedAt: number;
  hotels: TripHotel[];
  /** Every itinerary item, in day → slot → sort order. */
  items: TripItem[];
};

// Request bodies: derived from the server's schemas so the two can't drift.
export type NewTripInput = z.input<typeof createTripInput>;
export type TripPatch = z.input<typeof updateTripInput>;
export type TripHotelInput = z.input<typeof createHotelInput>;
export type TripHotelPatch = z.input<typeof updateHotelInput>;
export type TripItemInput = z.input<typeof createItemInput>;
export type TripItemPatch = z.input<typeof updateItemInput>;

export type TripChat = {
  /** Saved conversation, oldest first (AI SDK UIMessage shape). */
  messages: UIMessage[];
  /** An AI model is configured, so the agent can run. */
  enabled: boolean;
  /** Firecrawl is configured, so the agent can search and read the web. */
  research: boolean;
  /** The agent changed the trip and its previous state can be restored. */
  canUndo: boolean;
};

/** Agent tools that change the trip; the board refreshes after each one finishes. */
export const TRIP_WRITE_TOOLS = [
  "update_trip",
  "shortlist_hotel",
  "update_hotel",
  "remove_hotel",
  "set_day",
  "add_item",
  "update_item",
  "remove_item",
] as const;

const trip = (id: string) => `/api/trips/${seg(id)}`;

/** Every write returns the whole updated trip so the board can swap it in. */
export const tripsApi = {
  list: () => http.get<TripSummary[]>("/api/trips"),

  create: (input: NewTripInput) => http.post<Trip>("/api/trips", input),

  get: (id: string) => http.get<Trip>(trip(id)),

  update: (id: string, patch: TripPatch) => http.patch<Trip>(trip(id), patch),

  remove: (id: string) => http.delete<void>(trip(id)),

  addHotel: (id: string, input: TripHotelInput) => http.post<Trip>(`${trip(id)}/hotels`, input),

  updateHotel: (id: string, hotelId: string, patch: TripHotelPatch) =>
    http.patch<Trip>(`${trip(id)}/hotels/${seg(hotelId)}`, patch),

  removeHotel: (id: string, hotelId: string) =>
    http.delete<Trip>(`${trip(id)}/hotels/${seg(hotelId)}`),

  addItem: (id: string, input: TripItemInput) => http.post<Trip>(`${trip(id)}/items`, input),

  updateItem: (id: string, itemId: string, patch: TripItemPatch) =>
    http.patch<Trip>(`${trip(id)}/items/${seg(itemId)}`, patch),

  chat: (id: string) => http.get<TripChat>(`${trip(id)}/chat`),

  /** Forget the conversation (the board is unchanged). */
  clearChat: (id: string) => http.delete<void>(`${trip(id)}/chat`),

  /** Streaming endpoint used by `useChat`. */
  chatUrl: (id: string) => `${trip(id)}/chat`,

  /** Swap a plan with its neighbour in the same day and slot. */
  moveItem: (id: string, itemId: string, direction: "up" | "down") =>
    http.post<Trip>(`${trip(id)}/items/${seg(itemId)}/move`, { direction }),

  /** Restore the trip as it was before the agent's latest edits. */
  undoAgent: (id: string) => http.post<Trip>(`${trip(id)}/undo`),

  removeItem: (id: string, itemId: string) => http.delete<Trip>(`${trip(id)}/items/${seg(itemId)}`),
};
