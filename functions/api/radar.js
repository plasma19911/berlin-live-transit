export async function onRequestGet(context) {
  const incoming = new URL(context.request.url);

  const allowed = [
    "north", "west", "south", "east",
    "results", "duration", "frames",
    "polylines", "language", "pretty"
  ];

  const params = new URLSearchParams();
  for (const key of allowed) {
    const value = incoming.searchParams.get(key);
    if (value !== null) params.set(key, value);
  }

  for (const required of ["north", "west", "south", "east"]) {
    if (!params.has(required)) {
      return Response.json(
        { error: `missing query parameter: ${required}` },
        { status: 400, headers: { "cache-control": "no-store" } }
      );
    }
  }

  const north = Number(params.get("north"));
  const west = Number(params.get("west"));
  const south = Number(params.get("south"));
  const east = Number(params.get("east"));
  if (![north, west, south, east].every(Number.isFinite) || north <= south || east <= west) {
    return Response.json(
      { error: "invalid bounding box" },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  // Keep requests bounded to the Berlin region. The browser normally sends only the
  // current visible map area, with a small margin around the viewport.
  if (north > 52.85 || south < 52.20 || east > 14.10 || west < 12.80) {
    return Response.json(
      { error: "bounding box outside supported Berlin region" },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  // Conservative limits to protect the upstream API while still providing enough
  // temporal frames and geometry for smooth interpolation on the map.
  const results = Math.min(256, Math.max(1, Number(params.get("results") || 128)));
  params.set("results", String(results));
  params.set("duration", String(Math.min(45, Math.max(10, Number(params.get("duration") || 30)))));
  params.set("frames", String(Math.min(10, Math.max(2, Number(params.get("frames") || 6)))));
  params.set("polylines", params.get("polylines") === "true" ? "true" : "false");
  params.set("pretty", "false");

  const upstreams = [
    "https://v6.vbb.transport.rest/radar",
    "https://v6.bvg.transport.rest/radar"
  ];

  let lastError = "upstream unavailable";

  for (const base of upstreams) {
    try {
      const url = `${base}?${params.toString()}`;
      const upstream = await fetch(url, {
        headers: {
          "accept": "application/json",
          "user-agent": "berlin-live-transit-map/1.4 (+https://berlin-live-transit.pages.dev/)"
        },
        cf: {
          cacheTtl: 3,
          cacheEverything: true
        }
      });

      const body = await upstream.text();

      if (!upstream.ok) {
        lastError = `${base}: HTTP ${upstream.status}`;
        continue;
      }

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
          "cache-control": "public, max-age=3",
          "x-radar-upstream": base,
          "x-radar-scope": "viewport"
        }
      });
    } catch (err) {
      lastError = `${base}: ${err?.message || String(err)}`;
    }
  }

  return Response.json(
    { error: lastError },
    { status: 502, headers: { "cache-control": "no-store" } }
  );
}
