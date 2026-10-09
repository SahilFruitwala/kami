import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { DayColor } from "@/lib/trip-colors.ts";
import type { LatLng } from "@/lib/trip-route.ts";

/**
 * An OpenStreetMap map of one or more itinerary days: each day's stops are
 * joined in order in that day's color, plus an optional hotel pin. Leaflet
 * touches `window` when it loads, so it is imported in an effect (browser
 * only). Pins are HTML (divIcon), so no marker images need serving.
 */

export type MapStop = LatLng & { label: string; title: string };
export type MapDay = { key: string; color: DayColor; stops: MapStop[] };

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function TripMap({
  days,
  hotel,
  label,
  className,
}: {
  days: MapDay[];
  hotel?: (LatLng & { title: string }) | null;
  /** Accessible description, e.g. "Map of day 2". */
  label: string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  // Re-draw only when the pins actually change.
  const key = JSON.stringify([days, hotel ?? null]);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    let resize: ResizeObserver | null = null;
    void import("leaflet").then((mod) => {
      const L = (mod as { default?: typeof import("leaflet") }).default ?? mod;
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);

      const points: Array<[number, number]> = [];
      const pin = (text: string, color: DayColor, extra = "") =>
        L.divIcon({
          html: `<span style="background:${color.fill};color:${color.ink}">${escape(text)}</span>`,
          className: `kami-map-pin ${extra}`.trim(),
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

      for (const day of days) {
        const route: Array<[number, number]> = day.stops.map((s) => [s.lat, s.lng]);
        if (route.length > 1) {
          L.polyline(route, {
            color: day.color.fill,
            weight: 2,
            opacity: 0.85,
            dashArray: "4 6",
          }).addTo(map);
        }
        for (const s of day.stops) {
          L.marker([s.lat, s.lng], { icon: pin(s.label, day.color), title: s.title })
            .bindTooltip(escape(s.title))
            .addTo(map);
        }
        points.push(...route);
      }
      if (hotel) {
        L.marker([hotel.lat, hotel.lng], {
          icon: pin("H", { fill: "#201b14", ink: "#ffffff" }, "kami-map-pin-hotel"),
          title: hotel.title,
          zIndexOffset: 1000,
        })
          .bindTooltip(escape(hotel.title))
          .addTo(map);
        points.push([hotel.lat, hotel.lng]);
      }

      const fit = () => {
        if (!map) return;
        map.invalidateSize();
        if (points.length === 1) map.setView(points[0], 15);
        else if (points.length) {
          map.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 16 });
        }
      };
      fit();
      // Keep every stop in view when the layout changes width (sidebar, phone rotation).
      resize = new ResizeObserver(() => fit());
      resize.observe(el.current);
    });
    return () => {
      cancelled = true;
      resize?.disconnect();
      map?.remove();
    };
    // `key` captures days + hotel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return <div ref={el} role="img" aria-label={label} className={className ?? "h-72 w-full"} />;
}
