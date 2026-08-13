const UPSTREAMS = [
  "https://v6.vbb.transport.rest",
  "https://v6.bvg.transport.rest"
];

const ROUTE_WINDOW_MINUTES = 60;
const ROUTE_RESULTS = 16;
const MAX_LATER_PAGES = 2;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": status === 200 ? "public, max-age=15" : "no-store" }
  });
}

function berlinish(item) {
  const p = item?.location || item || {};
  const lat = Number(p.latitude);
  const lon = Number(p.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    if (lat >= 52.25 && lat <= 52.75 && lon >= 12.90 && lon <= 13.85) return true;
  }
  const text = `${item?.name || ""} ${item?.address || p?.address || ""}`.toLowerCase();
  return text.includes("berlin");
}

function locationLabel(item) {
  return item?.address || item?.location?.address || item?.name || "Ort";
}

function chooseLocation(items, query) {
  if (!Array.isArray(items) || !items.length) return null;
  const wantsAddress = /\d/.test(query);
  const ranked = items.map((item, index) => {
    const p = item?.location || item || {};
    const hasCoords = Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
    const type = String(item?.type || p?.type || "").toLowerCase();
    const hasAddress = Boolean(item?.address || p?.address) || type === "location" || type === "address";
    let score = 0;
    if (hasCoords) score += 20;
    if (berlinish(item)) score += 20;
    if (wantsAddress && hasAddress) score += 30;
    if (!wantsAddress && (type === "stop" || type === "station")) score += 8;
    score -= index * 0.1;
    return { item, score };
  }).filter(x => {
    const p = x.item?.location || x.item || {};
    return Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0]?.item || null;
}

async function fetchJson(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "berlin-live-transit-map/1.2"
      },
      cf: { cacheTtl: 15, cacheEverything: true }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function resolveLocation(base, query) {
  const variants = /\bberlin\b/i.test(query) ? [query] : [`${query}, Berlin`, query];
  let last = null;
  for (const q of variants) {
    const params = new URLSearchParams({
      query: q,
      results: "8",
      stops: "true",
      addresses: "true",
      poi: "true",
      language: "de",
      pretty: "false"
    });
    const items = await fetchJson(`${base}/locations?${params}`);
    const chosen = chooseLocation(items, query);
    if (chosen) {
      last = chosen;
      if (berlinish(chosen)) return chosen;
    }
  }
  return last;
}

function addLocation(params, prefix, item) {
  const p = item?.location || item || {};
  const lat = Number(p.latitude);
  const lon = Number(p.longitude);
  const type = String(item?.type || "").toLowerCase();

  if ((type === "stop" || type === "station") && item?.id) {
    params.set(prefix, String(item.id));
    return;
  }

  params.set(`${prefix}.latitude`, String(lat));
  params.set(`${prefix}.longitude`, String(lon));
  const address = item?.address || p?.address;
  if (address) params.set(`${prefix}.address`, String(address));
  else {
    if (item?.id) params.set(`${prefix}.id`, String(item.id));
    params.set(`${prefix}.name`, String(item?.name || locationLabel(item)));
  }
}

function journeyDepartureMs(journey) {
  const legs = Array.isArray(journey?.legs) ? journey.legs : [];
  if (!legs.length) return NaN;
  return new Date(legs[0]?.departure || legs[0]?.plannedDeparture || 0).getTime();
}

function latestDepartureMs(journeys) {
  let latest = Number.NEGATIVE_INFINITY;
  for (const journey of journeys) {
    const departure = journeyDepartureMs(journey);
    if (Number.isFinite(departure) && departure > latest) latest = departure;
  }
  return latest;
}

function journeyScore(journey) {
  const legs = Array.isArray(journey?.legs) ? journey.legs : [];
  if (!legs.length) return Number.POSITIVE_INFINITY;
  const departure = journeyDepartureMs(journey);
  const arrival = new Date(legs.at(-1)?.arrival || legs.at(-1)?.plannedArrival || 0).getTime();
  if (!Number.isFinite(departure) || !Number.isFinite(arrival) || arrival <= departure) return Number.POSITIVE_INFINITY;
  const cancelled = legs.some(l => l?.cancelled) ? 24 * 60 : 0;
  const transitLegs = legs.filter(l => l?.line && !l?.walking).length;
  const transfers = Math.max(0, transitLegs - 1);
  return (arrival - departure) / 60000 + transfers * 2.5 + cancelled;
}

function journeyIdentity(journey) {
  const legs = Array.isArray(journey?.legs) ? journey.legs : [];
  return legs.map(leg => {
    if (leg?.walking) return `walk:${leg?.origin?.name || ""}>${leg?.destination?.name || ""}`;
    return `${leg?.tripId || ""}:${leg?.line?.id || leg?.line?.name || ""}:${leg?.departure || leg?.plannedDeparture || ""}`;
  }).join("|");
}

function continuationParams(laterRef, baseParams) {
  const params = new URLSearchParams(baseParams);
  params.delete("departure");
  params.delete("arrival");
  params.set("laterThan", String(laterRef));
  params.set("results", String(ROUTE_RESULTS));
  return params;
}

async function routeVia(base, fromText, toText) {
  const [from, to] = await Promise.all([
    resolveLocation(base, fromText),
    resolveLocation(base, toText)
  ]);
  if (!from) throw new Error(`Start nicht gefunden: ${fromText}`);
  if (!to) throw new Error(`Ziel nicht gefunden: ${toText}`);

  const requestedAt = Date.now();
  const windowUntil = requestedAt + ROUTE_WINDOW_MINUTES * 60 * 1000;
  const params = new URLSearchParams({
    departure: new Date(requestedAt).toISOString(),
    results: String(ROUTE_RESULTS),
    stopovers: "true",
    polylines: "true",
    remarks: "true",
    language: "de",
    pretty: "false",
    startWithWalking: "true",
    walkingSpeed: "normal"
  });
  addLocation(params, "from", from);
  addLocation(params, "to", to);

  const firstPage = await fetchJson(`${base}/journeys?${params}`);
  const allJourneys = Array.isArray(firstPage?.journeys) ? [...firstPage.journeys] : [];
  let laterRef = firstPage?.laterRef || null;
  let laterPages = 0;
  let realtimeDataUpdatedAt = firstPage?.realtimeDataUpdatedAt || null;

  while (laterRef && laterPages < MAX_LATER_PAGES && latestDepartureMs(allJourneys) < windowUntil) {
    const page = await fetchJson(`${base}/journeys?${continuationParams(laterRef, params)}`);
    const more = Array.isArray(page?.journeys) ? page.journeys : [];
    if (!more.length) break;
    allJourneys.push(...more);
    laterRef = page?.laterRef || null;
    realtimeDataUpdatedAt = page?.realtimeDataUpdatedAt || realtimeDataUpdatedAt;
    laterPages++;
  }

  const usableRaw = allJourneys.filter(j => Array.isArray(j?.legs) && j.legs.length);
  const unique = new Map();
  for (const journey of usableRaw) {
    const key = journeyIdentity(journey);
    if (!unique.has(key)) unique.set(key, journey);
  }
  const usable = [...unique.values()];

  const journeysWithinHour = usable
    .filter(j => {
      const departure = journeyDepartureMs(j);
      return Number.isFinite(departure) && departure >= requestedAt - 2 * 60 * 1000 && departure <= windowUntil;
    })
    .sort((a, b) => journeyDepartureMs(a) - journeyDepartureMs(b));

  const candidates = journeysWithinHour.length ? journeysWithinHour : usable;
  const ranked = [...candidates].sort((a, b) => journeyScore(a) - journeyScore(b));
  if (!ranked.length) throw new Error("Keine ÖPNV-Verbindung gefunden.");

  const journey = ranked[0];
  return {
    from,
    to,
    journey,
    journeysWithinHour,
    alternatives: ranked.filter(j => j !== journey).slice(0, 7),
    routeWindowMinutes: ROUTE_WINDOW_MINUTES,
    routeWindowStart: new Date(requestedAt).toISOString(),
    routeWindowEnd: new Date(windowUntil).toISOString(),
    laterPagesFetched: laterPages,
    realtimeDataUpdatedAt
  };
}

export async function onRequestGet(context) {
  const incoming = new URL(context.request.url);
  const from = (incoming.searchParams.get("from") || "").trim();
  const to = (incoming.searchParams.get("to") || "").trim();

  if (!from || !to) return json({ error: "from und to sind erforderlich" }, 400);
  if (from.length > 180 || to.length > 180) return json({ error: "Start oder Ziel ist zu lang" }, 400);

  let lastError = "Routing nicht verfügbar";
  for (const base of UPSTREAMS) {
    try {
      const result = await routeVia(base, from, to);
      return json({ ...result, upstream: base });
    } catch (error) {
      lastError = error?.message || String(error);
    }
  }
  return json({ error: lastError }, 502);
}
