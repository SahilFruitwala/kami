/**
 * Geocoding for trip map pins via Nominatim (OpenStreetMap). The public
 * instance allows about one request per second and needs an identifying
 * User-Agent; `NOMINATIM_URL` points at another instance.
 *
 * The URL builder and response parser are pure so they can be unit-tested
 * (scripts/trip-route.test.mjs).
 */

export const DEFAULT_NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const TIMEOUT_MS = 8_000;
const USER_AGENT = "KAMI trip planner (https://kami.sahilfruitwala.com)";

export function nominatimBase(): string {
  return (process.env.NOMINATIM_URL?.trim() || DEFAULT_NOMINATIM_URL).replace(/\/+$/, "");
}

export function buildGeocodeUrl(base: string, query: string): string {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1" });
  return `${base}/search?${params}`;
}

/** First result's coordinates, or null when nothing matched or the shape is off. */
export function parseGeocodeResponse(payload: unknown): { lat: number; lng: number } | null {
  if (!Array.isArray(payload) || !payload.length) return null;
  const first = payload[0] as { lat?: unknown; lon?: unknown };
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Look up one free-text place. Throws on network / HTTP errors; null when not found. */
export async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(buildGeocodeUrl(nominatimBase(), query), {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Geocoder answered ${res.status}`);
  return parseGeocodeResponse(await res.json());
}
