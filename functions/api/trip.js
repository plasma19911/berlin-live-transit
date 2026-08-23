const TRANSPORT_REST_UPSTREAMS = ["https://v6.vbb.transport.rest", "https://v6.bvg.transport.rest"];
const TRANSITOUS_TRIP_URL = "https://api.transitous.org/api/v6/trip";
const APP_USER_AGENT = "berlin-live-transit/1.2 (+https://berlin-live-transit.pages.dev/)";

const PRODUCT_BY_MODE = {
  SUBURBAN: "suburban", SUBWAY: "subway", TRAM: "tram", BUS: "bus", COACH: "bus",
  FERRY: "ferry", REGIONAL_RAIL: "regional", HIGHSPEED_RAIL: "express",
  LONG_DISTANCE: "express", NIGHT_RAIL: "express"
};

async function fetchWithTimeout(url, options, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function delaySeconds(actual, scheduled) {
  const actualTime = Date.parse(actual), scheduledTime = Date.parse(scheduled);
  if (!Number.isFinite(actualTime) || !Number.isFinite(scheduledTime)) return null;
  return Math.round((actualTime - scheduledTime) / 1000);
}

function stopoverFromPlace(place) {
  if (!place) return null;
  const latitude = Number(place.lat ?? place.latitude), longitude = Number(place.lon ?? place.longitude);
  return {
    stop: {
      id: place.stopId || place.id || "", name: place.name || "Haltestelle",
      location: {
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null
      }
    },
    arrival: place.arrival || null, departure: place.departure || null,
    plannedArrival: place.scheduledArrival || null, plannedDeparture: place.scheduledDeparture || null,
    arrivalDelay: delaySeconds(place.arrival, place.scheduledArrival),
    departureDelay: delaySeconds(place.departure, place.scheduledDeparture),
    arrivalPlatform: place.track || null, departurePlatform: place.track || null,
    plannedArrivalPlatform: place.scheduledTrack || null, plannedDeparturePlatform: place.scheduledTrack || null,
    cancelled: Boolean(place.cancelled)
  };
}

function decodePolyline(encoded, precision = 5) {
  if (typeof encoded !== "string" || !encoded) return [];
  const factor = 10 ** precision, coordinates = [];
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
    coordinates.push([longitude / factor, latitude / factor]);
  }
  return coordinates;
}

function transformTransitousTrip(itinerary, requestedTripId) {
  const legs = Array.isArray(itinerary?.legs) ? itinerary.legs.filter((leg) => PRODUCT_BY_MODE[leg?.mode]) : [];
  if (legs.length === 0) throw new Error("Transitous trip contains no transit leg");

  const stopovers = [], polylineCoordinates = [];
  for (const leg of legs) {
    const places = [leg.from, ...(Array.isArray(leg.intermediateStops) ? leg.intermediateStops : []), leg.to];
    for (const place of places) {
      const stopover = stopoverFromPlace(place);
      if (!stopover) continue;
      const previous = stopovers.at(-1);
      if (previous?.stop?.id && previous.stop.id === stopover.stop.id) {
        stopovers[stopovers.length - 1] = { ...previous, ...stopover, stop: stopover.stop };
      } else {
        stopovers.push(stopover);
      }
    }

    const geometry = leg?.legGeometry;
    const coordinates = decodePolyline(geometry?.points, Number(geometry?.precision ?? 6));
    if (coordinates.length > 0) {
      if (polylineCoordinates.length > 0) coordinates.shift();
      polylineCoordinates.push(...coordinates);
    }
  }

  const firstLeg = legs[0], lastLeg = legs.at(-1);
  const lineName = firstLeg.displayName || firstLeg.routeShortName || firstLeg.tripShortName || "?";
  return {
    id: requestedTripId, tripId: requestedTripId,
    direction: lastLeg.headsign || lastLeg.tripTo?.name || lastLeg.to?.name || "Richtung unbekannt",
    line: { id: firstLeg.routeId || lineName, name: lineName, product: PRODUCT_BY_MODE[firstLeg.mode] },
    stopovers,
    polyline: {
      type: "Feature", properties: { source: "Transitous / MOTIS" },
      geometry: { type: "LineString", coordinates: polylineCoordinates }
    },
    realtime: legs.some((leg) => leg.realTime), source: "transitous"
  };
}

async function fetchTransportRestTrip(tripId, params) {
  let lastError = "transport.rest unavailable";
  for (const base of TRANSPORT_REST_UPSTREAMS) {
    try {
      const response = await fetchWithTimeout(`${base}/trips/${encodeURIComponent(tripId)}?${params.toString()}`, {
        headers: { accept: "application/json", "user-agent": APP_USER_AGENT },
        cf: { cacheTtl: 5, cacheEverything: true }
      });
      if (!response.ok) {
        lastError = `${base}: HTTP ${response.status}`;
        continue;
      }
      return { ok: true, body: await response.text(), contentType: response.headers.get("content-type") };
    } catch (error) {
      lastError = `${base}: ${error?.message || String(error)}`;
    }
  }
  return { ok: false, error: lastError };
}

async function fetchTransitousTrip(tripId) {
  const params = new URLSearchParams({
    tripId, withScheduledSkippedStops: "false", detailedLegs: "true",
    joinInterlinedLegs: "false", language: "de"
  });
  const response = await fetch(`${TRANSITOUS_TRIP_URL}?${params.toString()}`, {
    headers: { accept: "application/json", "user-agent": APP_USER_AGENT },
    cf: { cacheTtl: 15, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`Transitous: HTTP ${response.status}`);
  return transformTransitousTrip(await response.json(), tripId);
}

export async function onRequestGet(context) {
  const incoming = new URL(context.request.url), tripId = incoming.searchParams.get("id");
  if (!tripId) return Response.json({ error: "missing query parameter: id" }, { status: 400 });
  if (tripId.length > 500) return Response.json({ error: "trip id too long" }, { status: 400 });

  // IDs emitted by the map fallback are native MOTIS/Transitous IDs.
  if (/^\d{8}_/.test(tripId)) {
    try {
      const trip = await fetchTransitousTrip(tripId);
      return Response.json(trip, {
        status: 200,
        headers: {
          "cache-control": "public, max-age=15", "x-trip-upstream": TRANSITOUS_TRIP_URL, "x-trip-fallback": "true"
        }
      });
    } catch (_) {
      // A primary-provider ID can occasionally share this shape; continue with the normal chain.
    }
  }

  const primary = await fetchTransportRestTrip(tripId, new URLSearchParams({
    stopovers: "true", remarks: "true", polyline: "true", language: "de", pretty: "false"
  }));
  if (primary.ok) {
    return new Response(primary.body, {
      status: 200,
      headers: {
        "content-type": primary.contentType || "application/json; charset=utf-8",
        "cache-control": "public, max-age=5", "x-trip-upstream": "transport.rest"
      }
    });
  }

  try {
    const trip = await fetchTransitousTrip(tripId);
    return Response.json(trip, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=15", "x-trip-upstream": TRANSITOUS_TRIP_URL, "x-trip-fallback": "true"
      }
    });
  } catch (error) {
    return Response.json({ error: "all trip providers failed", details: [primary.error, error?.message || String(error)] },
      { status: 502, headers: { "cache-control": "no-store" } });
  }
}
