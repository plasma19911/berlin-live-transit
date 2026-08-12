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
        { status: 400 }
      );
    }
  }

  // Conservative limits to protect the upstream API.
  const results = Math.min(
    256,
    Math.max(1, Number(params.get("results") || 128))
  );
  params.set("results", String(results));
  params.set("duration", String(Math.min(60, Math.max(1, Number(params.get("duration") || 30)))));
  params.set("frames", String(Math.min(10, Math.max(1, Number(params.get("frames") || 3)))));
  params.set("polylines", "false");
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
          "user-agent": "berlin-live-transit-map/1.0"
        },
        cf: {
          cacheTtl: 5,
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
          "cache-control": "public, max-age=5",
          "x-radar-upstream": base
        }
      });
    } catch (err) {
      lastError = `${base}: ${err?.message || String(err)}`;
    }
  }

  return Response.json(
    { error: lastError },
    { status: 502 }
  );
}
