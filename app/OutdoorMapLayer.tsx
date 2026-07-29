"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

export type OutdoorMapBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type OutdoorFeatureKind =
  | "building"
  | "road"
  | "path"
  | "fence"
  | "water"
  | "green";

export type OutdoorFeature = {
  id: string;
  kind: OutdoorFeatureKind;
  points: Array<{ x: number; y: number }>;
  closed: boolean;
};

export type OutdoorMapState = {
  address: string;
  center: { lat: number; lng: number };
  zoom: number;
  bounds: OutdoorMapBounds | null;
  locked: boolean;
  features: OutdoorFeature[];
};

export function createEmptyOutdoorMap(): OutdoorMapState {
  return {
    address: "",
    center: { lat: 48.0196, lng: 66.9237 },
    zoom: 5,
    bounds: null,
    locked: false,
    features: [],
  };
}

type NominatimResult = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

type OverpassElement = {
  id?: number;
  geometry?: Array<{ lat?: number; lon?: number }>;
  tags?: Record<string, string>;
};

function featureKind(tags: Record<string, string>): OutdoorFeatureKind | null {
  if (tags.building) return "building";
  if (tags.barrier) return "fence";
  if (tags.natural === "water" || tags.waterway || tags.water) return "water";
  if (tags.highway) {
    return ["footway", "path", "pedestrian", "steps", "track"].includes(tags.highway)
      ? "path"
      : "road";
  }
  if (tags.landuse || tags.leisure || tags.natural) return "green";
  return null;
}

function normalizedFeaturePoints(
  geometry: NonNullable<OverpassElement["geometry"]>,
  bounds: OutdoorMapBounds,
) {
  const width = Math.max(0.000001, bounds.east - bounds.west);
  const height = Math.max(0.000001, bounds.north - bounds.south);
  const step = Math.max(1, Math.ceil(geometry.length / 140));

  return geometry.flatMap((point, index) => {
    if (index % step !== 0 && index !== geometry.length - 1) return [];
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return [];

    return [{
      x: Math.min(100, Math.max(0, ((point.lon! - bounds.west) / width) * 100)),
      y: Math.min(100, Math.max(0, ((bounds.north - point.lat!) / height) * 100)),
    }];
  });
}

export async function geocodeOutdoorAddress(query: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&q=${encodeURIComponent(query)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error("geocoding-failed");

  const results = await response.json() as NominatimResult[];
  const result = results[0];
  const lat = Number(result?.lat);
  const lng = Number(result?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    address: result.display_name?.trim() || query.trim(),
    center: { lat, lng },
  };
}

export async function fetchOutdoorFeatures(bounds: OutdoorMapBounds) {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const query = `[out:json][timeout:25];
(
  way["building"](${bbox});
  way["highway"](${bbox});
  way["barrier"](${bbox});
  way["waterway"](${bbox});
  way["natural"="water"](${bbox});
  way["landuse"](${bbox});
  way["leisure"](${bbox});
);
out geom;`;
  const body = new URLSearchParams({ data: query });
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("overpass-failed");

  const data = await response.json() as { elements?: OverpassElement[] };
  return (data.elements ?? []).flatMap((element) => {
    const tags = element.tags ?? {};
    const kind = featureKind(tags);
    const geometry = element.geometry ?? [];
    if (!kind || geometry.length < 2) return [];

    const points = normalizedFeaturePoints(geometry, bounds);
    if (points.length < 2) return [];

    const first = geometry[0];
    const last = geometry[geometry.length - 1];
    const closed = geometry.length >= 4
      && first.lat === last.lat
      && first.lon === last.lon;

    return [{
      id: `${kind}-${element.id ?? Math.random().toString(36).slice(2)}`,
      kind,
      points,
      closed,
    } satisfies OutdoorFeature];
  });
}

export default function OutdoorMapLayer({
  state,
  onViewChange,
}: {
  state: OutdoorMapState;
  onViewChange: (patch: Pick<OutdoorMapState, "center" | "zoom" | "bounds">) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const onViewChangeRef = useRef(onViewChange);
  const initialStateRef = useRef(state);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    async function mountMap() {
      if (!containerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        attributionControl: true,
        zoomControl: false,
        minZoom: 3,
        maxZoom: 20,
      }).setView(
        [initialStateRef.current.center.lat, initialStateRef.current.center.lng],
        initialStateRef.current.zoom,
      );

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      L.control.zoom({ position: "bottomright" }).addTo(map);

      const syncView = () => {
        const center = map.getCenter();
        const bounds = map.getBounds();
        onViewChangeRef.current({
          center: { lat: center.lat, lng: center.lng },
          zoom: map.getZoom(),
          bounds: {
            south: bounds.getSouth(),
            west: bounds.getWest(),
            north: bounds.getNorth(),
            east: bounds.getEast(),
          },
        });
      };

      map.on("moveend zoomend", syncView);
      mapRef.current = map;
      syncView();

      resizeObserver = new ResizeObserver(() => map.invalidateSize({ animate: false }));
      resizeObserver.observe(containerRef.current);
    }

    void mountMap();
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const current = map.getCenter();
    const moved = Math.abs(current.lat - state.center.lat) > 0.000001
      || Math.abs(current.lng - state.center.lng) > 0.000001
      || map.getZoom() !== state.zoom;
    if (moved) map.setView([state.center.lat, state.center.lng], state.zoom);
  }, [state.center.lat, state.center.lng, state.zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (state.locked) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
      map.touchZoom.disable();
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
      map.touchZoom.enable();
    }
  }, [state.locked]);

  return (
    <div
      className={`outdoor-map-layer${state.locked ? " locked" : ""}`}
      ref={containerRef}
      aria-label="Техническая подложка OpenStreetMap"
    />
  );
}
