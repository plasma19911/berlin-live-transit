const UPSTREAMS = [
  "https://v6.vbb.transport.rest/radar",
  "https://v6.bvg.transport.rest/radar"
];

const ROWS = [
  [52.72, 52.58],
  [52.58, 52.44],
  [52.44, 52.30]
];

const COLS = [
  [13.05, 13.2375],
  [13.2375, 13.4250],
  [13.4250, 13.6125],
  [13.6125, 13.80]
];

const TILES = ROWS.flatMap(([north, south]) =>
  COLS.map(([west, east]) => ({ north, south, west, east }))
);

const UPSTREAM_TIMEOUT_MS = 4500;

function movementKey(m) {
  const p = m?.location || m?.position || {};
  const lat = Number(p.latitude ?? p.lat);
  const lon = Number(p.longitude ?? p.lon);

  return String(
    m?.tripId ||
    m?.journeyId ||
    m?.id ||
    `${m?.line?.id || m?.line?.name || "line"}|${Number.isFinite(lat) ? lat.toFixed(5) : ""}|${Number.isFinite(lon) ? lon.toFixed(5) : ""}`
  );
}

async function fetchWithTimeout(url, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "berlin-live-transit-map/1.1"
      },
      cf: {
        cacheTtl: 8,
        cacheEverything: true
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchUpstreamTile(tile) {
  const params = new URLSearchParams({
    north: String(tile.north),
    west: String(tile.west),
    south: String(tile.south),
    east: String(tile.east),
    results: "256",
    duration: "30",
    frames: "3",
    polylines: "false",
    language: "de",
    pretty: "false"
  });

  let lastError = "upstream unavailable";

  for (const base of UPSTREAMS) {
    try {
      const response = await fetchWithTimeout(`${base}?${params.toString()}`);
      const text = await response.text();

      if (!response.ok) {
        lastError = `${base}: HTTP ${response.status}`;
        continue;
      }

      const json = JSON.parse(text);
      const movements = Array.isArray(json)
        ? json
        : Array.isArray(json.movements)
          ? json.movements
          : Array.isArray(json.vehicles)
            ? json.vehicles
            : [];

      return { ok: true, movements, upstream: base };
    } catch (error) {
      const name = error?.name || "Error";
      const message = error?.message || String(error);
      lastError = `${base}: ${name === "AbortError" ? "timeout" : message}`;
    }
  }

  return { ok: false, movements: [], error: lastError };
}

export async function onRequestGet() {
  const started = Date.now();
  const results = await Promise.all(TILES.map(fetchUpstreamTile));

  const unique = new Map();
  const errors = [];
  let tilesOk = 0;
  const upstreamCounts = {};

  for (const result of results) {
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }

    tilesOk++;
    upstreamCounts[result.upstream] = (upstreamCounts[result.upstream] || 0) + 1;

    for (const movement of result.movements) {
      unique.set(movementKey(movement), movement);
    }
  }

  if (tilesOk === 0) {
    return Response.json(
      {
        error: "all Berlin radar tiles failed",
        details: errors.slice(0, 12),
        elapsed_ms: Date.now() - started
      },
      {
        status: 502,
        headers: { "cache-control": "no-store" }
      }
    );
  }

  return Response.json(
    {
      movements: [...unique.values()],
      meta: {
        tiles_ok: tilesOk,
        tiles_total: TILES.length,
        vehicles_raw_unique: unique.size,
        coverage: "Berlin",
        partial: tilesOk !== TILES.length,
        elapsed_ms: Date.now() - started,
        upstreams: upstreamCounts,
        errors: errors.slice(0, 4)
      }
    },
    {
      status: 200,
      headers: {
        "cache-control": tilesOk === TILES.length ? "public, max-age=8" : "public, max-age=3"
      }
    }
  );
}
