const UPSTREAMS = [
  "https://v6.vbb.transport.rest/radar",
  "https://v6.bvg.transport.rest/radar"
];

const APP_USER_AGENT = "berlin-live-transit-map/1.5 (+https://berlin-live-transit.pages.dev/)";
const MAX_LAT_SPAN = 0.10;
const MAX_LON_SPAN = 0.14;
const MAX_TILES = 16;
const UPSTREAM_TIMEOUT_MS = 5000;

function finiteParam(url, name) {
  const value = Number(url.searchParams.get(name));
  return Number.isFinite(value) ? value : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function splitRange(min, max, maxSpan) {
  const span = Math.max(0, max - min);
  const count = Math.max(1, Math.ceil(span / maxSpan));
  const step = span / count;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push([min + i * step, i === count - 1 ? max : min + (i + 1) * step]);
  }
  return out;
}

function buildTiles(north, west, south, east) {
  const rows = splitRange(south, north, MAX_LAT_SPAN);
  const cols = splitRange(west, east, MAX_LON_SPAN);
  const tiles = [];
  for (const [rowSouth, rowNorth] of rows) {
    for (const [colWest, colEast] of cols) {
      tiles.push({ north: rowNorth, south: rowSouth, west: colWest, east: colEast });
    }
  }
  return tiles.slice(0, MAX_TILES);
}

function movementKey(movement) {
  const position = movement?.location || movement?.position || {};
  const lat = Number(position.latitude ?? position.lat);
  const lon = Number(position.longitude ?? position.lon);
  return String(
    movement?.tripId || movement?.journeyId || movement?.id ||
    `${movement?.line?.id || movement?.line?.name || "line"}|${Number.isFinite(lat) ? lat.toFixed(5) : ""}|${Number.isFinite(lon) ? lon.toFixed(5) : ""}`
  );
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": APP_USER_AGENT
      },
      cf: {
        cacheTtl: 3,
        cacheEverything: true
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTile(tile, options) {
  const params = new URLSearchParams({
    north: String(tile.north),
    west: String(tile.west),
    south: String(tile.south),
    east: String(tile.east),
    results: String(options.results),
    duration: String(options.duration),
    frames: String(options.frames),
    polylines: options.polylines ? "true" : "false",
    language: options.language,
    pretty: "false"
  });

  let lastError = "upstream unavailable";
  for (const base of UPSTREAMS) {
    try {
      const response = await fetchWithTimeout(`${base}?${params.toString()}`);
      if (!response.ok) {
        lastError = `${base}: HTTP ${response.status}`;
        continue;
      }
      const json = await response.json();
      const movements = Array.isArray(json)
        ? json
        : Array.isArray(json?.movements)
          ? json.movements
          : Array.isArray(json?.vehicles)
            ? json.vehicles
            : [];
      return {
        ok: true,
        movements,
        upstream: base,
        realtimeDataUpdatedAt: json?.realtimeDataUpdatedAt ?? null
      };
    } catch (error) {
      lastError = `${base}: ${error?.name === "AbortError" ? "timeout" : error?.message || String(error)}`;
    }
  }
  return { ok: false, movements: [], error: lastError };
}

export async function onRequestGet(context) {
  const incoming = new URL(context.request.url);
  const north = finiteParam(incoming, "north");
  const west = finiteParam(incoming, "west");
  const south = finiteParam(incoming, "south");
  const east = finiteParam(incoming, "east");

  if (![north, west, south, east].every(Number.isFinite)) {
    return Response.json({ error: "missing or invalid north/west/south/east" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (north <= south || east <= west) {
    return Response.json({ error: "invalid bounding box" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const bounded = {
    north: clamp(north, 52.25, 52.80),
    south: clamp(south, 52.25, 52.80),
    west: clamp(west, 12.90, 14.00),
    east: clamp(east, 12.90, 14.00)
  };
  if (bounded.north <= bounded.south || bounded.east <= bounded.west) {
    return Response.json({ movements: [], meta: { tiles_ok: 0, tiles_total: 0, coverage: "outside Berlin" } }, { status: 200 });
  }

  const options = {
    results: Math.min(256, Math.max(32, Number(incoming.searchParams.get("results") || 256))),
    duration: Math.min(30, Math.max(5, Number(incoming.searchParams.get("duration") || 20))),
    frames: Math.min(6, Math.max(2, Number(incoming.searchParams.get("frames") || 4))),
    polylines: incoming.searchParams.get("polylines") !== "false",
    language: incoming.searchParams.get("language") || "de"
  };

  const tiles = buildTiles(bounded.north, bounded.west, bounded.south, bounded.east);
  const started = Date.now();
  const results = await Promise.all(tiles.map(tile => fetchTile(tile, options)));
  const unique = new Map();
  const errors = [];
  const upstreams = {};
  const realtimeUpdates = [];
  let tilesOk = 0;

  for (const result of results) {
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    tilesOk++;
    upstreams[result.upstream] = (upstreams[result.upstream] || 0) + 1;
    if (result.realtimeDataUpdatedAt) realtimeUpdates.push(result.realtimeDataUpdatedAt);
    for (const movement of result.movements) unique.set(movementKey(movement), movement);
  }

  if (tilesOk === 0) {
    return Response.json({
      error: "viewport radar providers failed",
      details: errors.slice(0, 8),
      tiles_total: tiles.length,
      elapsed_ms: Date.now() - started
    }, { status: 502, headers: { "cache-control": "no-store" } });
  }

  return Response.json({
    movements: [...unique.values()],
    meta: {
      tiles_ok: tilesOk,
      tiles_total: tiles.length,
      vehicles_raw_unique: unique.size,
      coverage: "visible viewport",
      partial: tilesOk !== tiles.length,
      elapsed_ms: Date.now() - started,
      generated_at: new Date().toISOString(),
      realtime_data_updated_at: realtimeUpdates.length ? realtimeUpdates.at(-1) : null,
      upstreams,
      errors: errors.slice(0, 4)
    }
  }, {
    status: 200,
    headers: {
      "cache-control": tilesOk === tiles.length ? "public, max-age=3" : "public, max-age=1",
      "x-radar-tiles": `${tilesOk}/${tiles.length}`,
      "x-radar-scope": "viewport-tiled"
    }
  });
}
