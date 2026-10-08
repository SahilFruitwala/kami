import { http, seg } from "./client";

export type TripSlot = "morning" | "afternoon" | "evening" | "night";
export type TripHotelStatus = "shortlisted" | "chosen";

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
  createdAt: number;
  updatedAt: number;
  hotels: TripHotel[];
  /** Every itinerary item, in day → slot → sort order. */
  items: TripItem[];
};

export type NewTripInput = {
  destination: string;
  title?: string;
  startDate?: string | null;
  dayCount?: number;
};

export type TripPatch = {
  title?: string;
  destination?: string;
  startDate?: string | null;
  dayCount?: number;
  travelers?: number | null;
  budget?: string | null;
  preferences?: string | null;
};

export type TripHotelInput = {
  name: string;
  area?: string | null;
  url?: string | null;
  priceNote?: string | null;
  ratingNote?: string | null;
  why?: string | null;
};

export type TripHotelPatch = Partial<TripHotelInput> & { status?: TripHotelStatus };

export type TripItemInput = {
  dayIndex: number;
  slot: TripSlot;
  title: string;
  place?: string | null;
  url?: string | null;
  notes?: string | null;
};

export type TripItemPatch = Partial<TripItemInput>;

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

  removeItem: (id: string, itemId: string) => http.delete<Trip>(`${trip(id)}/items/${seg(itemId)}`),
};
