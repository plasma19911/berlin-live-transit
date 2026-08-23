const TRANSPORT_REST_UPSTREAMS = [
  "https://v6.vbb.transport.rest/radar",
  "https://v6.bvg.transport.rest/radar"
];

const TRANSITOUS_MAP_URL = "https://api.transitous.org/api/v6/map/trips";
const APP_USER_AGENT = "berlin-live-transit/1.2 (+https://berlin-live-transit.pages.dev/)";

const ROWS = [[52.72, 52.58], [52.58, 52.44], [52.44, 52.30]];
const COLS = [[13.05, 13.2375], [13.2375, 13.4250], [13.4250, 13.6125], [13.6125, 13.80]];
const TILES = ROWS.flatMap(([north, south]) => COLS.map(([west, east]) => ({ north, south, west, east })));

// Fail over quickly. A slow transport.rest call must not block the independent provider.
const UPSTREAM_TIMEOUT_MS = 1500;
const TRANSITOUS_TIMEOUT_MS = 9000;
const TRANSITOUS_PRODUCTS = {
  SUBURBAN: "suburban", SUBWAY: "subway", TRAM: "tram", BUS: "bus", COACH: "bus",
  FERRY: "ferry", REGIONAL_RAIL: "regional", HIGHSPEED_RAIL: "express",
  LONG_DISTANCE: "express", NIGHT_RAIL: "express"
};

function movementKey(movement) {
  const position = movement?.location || movement?.position || {};
  const latitude = Number(position.latitude ?? position.lat);
  const longitude = Number(position.longitude ?? position.lon);
  return String(movement?.tripId || movement?.journeyId || movement?.id ||
    `${movement?.line?.id || movement?.line?.name || "line"}|${Number.isFinite(latitude) ? latitude.toFixed(5) : ""}|${Number.isFinite(longitude) ? longitude.toFixed(5) : ""}`);
}

async function fetchWithTimeout(url, timeoutMs, cacheTtl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": APP_USER_AGENT },
      cf: { cacheTtl, cacheEverything: true }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTransportRestTile(tile) {
  const params = new URLSearchParams({
    north: String(tile.north), west: String(tile.west), south: String(tile.south), east: String(tile.east),
    results: "256", duration: "30", frames: "3", polylines: "false", language: "de", pretty: "false"
  });
  let lastError = "transport.rest unavailable";

  for (const base of TRANSPORT_REST_UPSTREAMS) {
    try {
      const response = await fetchWithTimeout(`${base}?${params.toString()}`, UPSTREAM_TIMEOUT_MS, 8);
      if (!response.ok) {
        lastError = `${base}: HTTP ${response.status}`;
        continue;
      }
      const json = await response.json();
      const movements = Array.isArray(json) ? json
        : Array.isArray(json.movements) ? json.movements
          : Array.isArray(json.vehicles) ? json.vehicles : [];
      return { ok: true, movements, upstream: base };
    } catch (error) {
      const message = error?.name === "AbortError" ? "timeout" : error?.message || String(error);
      lastError = `${base}: ${message}`;
    }
  }
  return { ok: false, movements: [], error: lastError };
}

function decodePolyline(encoded, precision = 5) {
  if (typeof encoded !== "string" || !encoded) return [];
  const factor = 10 ** precision;
  const points = [];
  let index = 0, latitude = 0, longitude = 0;

  while (index < encoded.length) {
    let result = 0, shift = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    latitude += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    longitude += result & 1 ? ~(result >> 1) : result >> 1;
    points.push([latitude / factor, longitude / factor]);
  }
  return points;
}

function distanceBetween(a, b) {
  const longitudeScale = Math.cos(((a[0] + b[0]) * Math.PI) / 360);
  return Math.hypot(b[0] - a[0], (b[1] - a[1]) * longitudeScale);
}

function bearingBetween(a, b) {
  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const deltaLongitude = ((b[1] - a[1]) * Math.PI) / 180;
  const y = Math.sin(deltaLongitude) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLongitude);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function positionAlong(points, fraction) {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (points.length === 1) return { point: points[0], bearing: 0 };

  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const length = distanceBetween(points[index - 1], points[index]);
    lengths.push(length);
    total += length;
  }
  if (total <= 0) return { point: points[0], bearing: 0 };

  const target = Math.min(1, Math.max(0, fraction)) * total;
  let travelled = 0;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    if (travelled + length >= target || index === lengths.length - 1) {
      const localFraction = length > 0 ? (target - travelled) / length : 0;
      const from = points[index], to = points[index + 1];
      return {
        point: [from[0] + (to[0] - from[0]) * localFraction, from[1] + (to[1] - from[1]) * localFraction],
        bearing: bearingBetween(from, to)
      };
    }
    travelled += length;
  }
  return { point: points.at(-1), bearing: bearingBetween(points.at(-2), points.at(-1)) };
}

function placeLocation(place) {
  const latitude = Number(place?.lat ?? place?.latitude);
  const longitude = Number(place?.lon ?? place?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function transitousSegmentPosition(segment, now) {
  const departure = Date.parse(segment?.departure);
  const arrival = Date.parse(segment?.arrival);
  const duration = arrival - departure;
  const fraction = Number.isFinite(duration) && duration > 0 ? (now - departure) / duration : 0.5;
  const points = decodePolyline(segment?.polyline, 5);
  if (points.length > 0) return positionAlong(points, fraction);

  const from = placeLocation(segment?.from), to = placeLocation(segment?.to);
  if (!from || !to) return null;
  const clamped = Math.min(1, Math.max(0, fraction));
  const fromPoint = [from.latitude, from.longitude], toPoint = [to.latitude, to.longitude];
  return {
    point: [from.latitude + (to.latitude - from.latitude) * clamped, from.longitude + (to.longitude - from.longitude) * clamped],
    bearing: bearingBetween(fromPoint, toPoint)
  };
}

function segmentScore(segment, now) {
  const departure = Date.parse(segment?.departure), arrival = Date.parse(segment?.arrival);
  if (!Number.isFinite(departure) || !Number.isFinite(arrival)) return Number.POSITIVE_INFINITY;
  if (departure <= now && arrival >= now) return 0;
  return Math.min(Math.abs(now - departure), Math.abs(now - arrival));
}

function movementFromTransitous(segment, trip, now) {
  const product = TRANSITOUS_PRODUCTS[segment?.mode];
  if (!product || !trip?.tripId) return null;
  const positioned = transitousSegmentPosition(segment, now);
  if (!positioned) return null;

  const [latitude, longitude] = positioned.point;
  if (latitude < 52.25 || latitude > 52.80 || longitude < 12.90 || longitude > 14.00) return null;

  const lineName = String(trip.displayName || trip.routeShortName || segment.mode || "?");
  const destinationName = segment?.to?.name || "Richtung unbekannt";
  const fromLocation = placeLocation(segment?.from), toLocation = placeLocation(segment?.to);
  return {
    id: trip.tripId, tripId: trip.tripId, journeyId: trip.tripId, name: lineName,
    direction: destinationName,
    destination: { name: destinationName, ...(toLocation ? { location: toLocation } : {}) },
    line: { id: lineName, name: lineName, product }, product,
    location: { latitude, longitude, bearing: positioned.bearing }, bearing: positioned.bearing,
    frames: fromLocation && toLocation ? [{ origin: { location: fromLocation }, destination: { location: toLocation } }] : [],
    departure: segment.departure, arrival: segment.arrival,
    plannedDeparture: segment.scheduledDeparture, plannedArrival: segment.scheduledArrival,
    realtime: Boolean(segment.realTime), source: "transitous"
  };
}

async function fetchTransitousFallback() {
  const now = Date.now();
  const params = new URLSearchParams({
    zoom: "13", min: "52.30,13.80", max: "52.72,13.05",
    startTime: new Date(now - 5000).toISOString(), endTime: new Date(now + 10000).toISOString(),
    precision: "5", language: "de"
  });
  const response = await fetchWithTimeout(`${TRANSITOUS_MAP_URL}?${params.toString()}`, TRANSITOUS_TIMEOUT_MS, 15);
  if (!response.ok) throw new Error(`Transitous: HTTP ${response.status}`);
  const segments = await response.json();
  if (!Array.isArray(segments)) throw new Error("Transitous: unexpected response format");

  const bestByTrip = new Map();
  for (const segment of segments) {
    if (!TRANSITOUS_PRODUCTS[segment?.mode] || !Array.isArray(segment?.trips)) continue;
    const score = segmentScore(segment, now);
    for (const trip of segment.trips) {
      if (!trip?.tripId) continue;
      const previous = bestByTrip.get(trip.tripId);
      if (!previous || score < previous.score) bestByTrip.set(trip.tripId, { segment, trip, score });
    }
  }

  const movements = [];
  for (const { segment, trip } of bestByTrip.values()) {
    const movement = movementFromTransitous(segment, trip, now);
    if (movement) movements.push(movement);
  }
  return movements;
}

export async function onRequestGet() {
  const started = Date.now();
  const results = await Promise.all(TILES.map(fetchTransportRestTile));
  const unique = new Map(), errors = [];
  let tilesOk = 0;
  const upstreamCounts = {};

  for (const result of results) {
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    tilesOk++;
    upstreamCounts[result.upstream] = (upstreamCounts[result.upstream] || 0) + 1;
    for (const movement of result.movements) unique.set(movementKey(movement), movement);
  }

  if (tilesOk === 0) {
    try {
      const fallbackMovements = await fetchTransitousFallback();
      for (const movement of fallbackMovements) unique.set(movementKey(movement), movement);
      if (unique.size > 0) {
        return Response.json({
          movements: [...unique.values()],
          meta: {
            tiles_ok: 1, tiles_total: 1, vehicles_raw_unique: unique.size, coverage: "Berlin",
            partial: false, fallback: true, elapsed_ms: Date.now() - started,
            upstreams: { [TRANSITOUS_MAP_URL]: 1 }, errors: errors.slice(0, 4)
          }
        }, {
          status: 200,
          headers: { "cache-control": "public, max-age=10", "x-radar-upstream": TRANSITOUS_MAP_URL, "x-radar-fallback": "true" }
        });
      }
      errors.push("Transitous returned no usable Berlin vehicles");
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }

  if (tilesOk === 0) {
    return Response.json({ error: "all Berlin radar providers failed", details: errors.slice(0, 12), elapsed_ms: Date.now() - started },
      { status: 502, headers: { "cache-control": "no-store" } });
  }

  return Response.json({
    movements: [...unique.values()],
    meta: {
      tiles_ok: tilesOk, tiles_total: TILES.length, vehicles_raw_unique: unique.size, coverage: "Berlin",
      partial: tilesOk !== TILES.length, fallback: false, elapsed_ms: Date.now() - started,
      upstreams: upstreamCounts, errors: errors.slice(0, 4)
    }
  }, {
    status: 200,
    headers: { "cache-control": tilesOk === TILES.length ? "public, max-age=8" : "public, max-age=3" }
  });
}
