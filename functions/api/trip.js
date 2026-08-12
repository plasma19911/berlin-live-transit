export async function onRequestGet(context) {
  const incoming = new URL(context.request.url);
  const tripId = incoming.searchParams.get("id");

  if (!tripId) {
    return Response.json({ error: "missing query parameter: id" }, { status: 400 });
  }

  if (tripId.length > 500) {
    return Response.json({ error: "trip id too long" }, { status: 400 });
  }

  const params = new URLSearchParams({
    stopovers: "true",
    remarks: "true",
    polyline: "true",
    language: "de",
    pretty: "false"
  });

  const upstreams = [
    "https://v6.vbb.transport.rest",
    "https://v6.bvg.transport.rest"
  ];

  let lastError = "upstream unavailable";

  for (const base of upstreams) {
    try {
      const url = `${base}/trips/${encodeURIComponent(tripId)}?${params.toString()}`;
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
          "x-trip-upstream": base
        }
      });
    } catch (err) {
      lastError = `${base}: ${err?.message || String(err)}`;
    }
  }

  return Response.json({ error: lastError }, { status: 502 });
}
