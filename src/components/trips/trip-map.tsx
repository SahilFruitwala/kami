import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/trip-route.ts";

/**
 * A small OpenStreetMap map with numbered stops joined in order, plus an
 * optional hotel pin. Leaflet touches `window` when it loads, so it is
 * imported in an effect (browser only). Pins are HTML (divIcon), so no
 * marker images need serving.
 */

export type MapStop = LatLng & { label: string; title: string };

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function TripMap({
  stops,
  hotel,
  className,
}: {
  stops: MapStop[];
  hotel?: (LatLng & { title: string }) | null;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  // Re-draw only when the pins actually change.
  const key = JSON.stringify([stops, hotel ?? null]);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    void import("leaflet").then((mod) => {
      const L = (mod as { default?: typeof import("leaflet") }).default ?? mod;
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);

      const points: Array<[number, number]> = [];
      const pin = (html: string, cls: string) =>
        L.divIcon({ html, className: cls, iconSize: [24, 24], iconAnchor: [12, 12] });

      if (hotel) {
        L.marker([hotel.lat, hotel.lng], {
          icon: pin("H", "kami-map-pin kami-map-pin-hotel"),
          title: hotel.title,
        })
          .bindTooltip(escape(hotel.title))
          .addTo(map);
        points.push([hotel.lat, hotel.lng]);
      }
      const route: Array<[number, number]> = stops.map((s) => [s.lat, s.lng]);
      if (route.length > 1) {
        L.polyline(route, { color: "#9c4a30", weight: 2, opacity: 0.7, dashArray: "4 6" }).addTo(
          map,
        );
      }
      for (const s of stops) {
        L.marker([s.lat, s.lng], { icon: pin(escape(s.label), "kami-map-pin"), title: s.title })
          .bindTooltip(escape(s.title))
          .addTo(map);
      }
      points.push(...route);

      if (points.length === 1) map.setView(points[0], 15);
      else map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 16 });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
    // `key` captures stops + hotel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div
      ref={el}
      role="img"
      aria-label={`Map of ${stops.length} ${stops.length === 1 ? "stop" : "stops"}`}
      className={className ?? "h-56 w-full"}
    />
  );
}
