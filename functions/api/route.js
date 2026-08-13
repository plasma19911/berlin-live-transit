const UPSTREAMS = [
  "https://v6.vbb.transport.rest",
  "https://v6.bvg.transport.rest"
];

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

async function fetchJson(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "berlin-live-transit-map/1.1"
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

function journeyScore(journey) {
  const legs = Array.isArray(journey?.legs) ? journey.legs : [];
  if (!legs.length) return Number.POSITIVE_INFINITY;
  const departure = new Date(legs[0]?.departure || legs[0]?.plannedDeparture || 0).getTime();
  const arrival = new Date(legs.at(-1)?.arrival || legs.at(-1)?.plannedArrival || 0).getTime();
  if (!Number.isFinite(departure) || !Number.isFinite(arrival) || arrival <= departure) return Number.POSITIVE_INFINITY;
  const cancelled = legs.some(l => l?.cancelled) ? 24 * 60 : 0;
  const transitLegs = legs.filter(l => l?.line && !l?.walking).length;
  const transfers = Math.max(0, transitLegs - 1);
  return (arrival - departure) / 60000 + transfers * 2.5 + cancelled;
}

async function routeVia(base, fromText, toText) {
  const [from, to] = await Promise.all([
    resolveLocation(base, fromText),
    resolveLocation(base, toText)
  ]);
  if (!from) throw new Error(`Start nicht gefunden: ${fromText}`);
  if (!to) throw new Error(`Ziel nicht gefunden: ${toText}`);

  const params = new URLSearchParams({
    results: "5",
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

  const data = await fetchJson(`${base}/journeys?${params}`);
  const journeys = Array.isArray(data?.journeys) ? data.journeys : [];
  const usable = journeys.filter(j => Array.isArray(j?.legs) && j.legs.length);
  usable.sort((a, b) => journeyScore(a) - journeyScore(b));
  if (!usable.length) throw new Error("Keine ÖPNV-Verbindung gefunden.");

  return {
    from,
    to,
    journey: usable[0],
    alternatives: usable.slice(1, 3),
    realtimeDataUpdatedAt: data?.realtimeDataUpdatedAt || null
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
