export async function onRequest(context) {
  const asset = await context.env.ASSETS.fetch(context.request);
  const type = asset.headers.get("content-type") || "";
  if (!type.includes("text/html")) return asset;

  let html = await asset.text();
  if (!html.includes('/enhancements.js')) {
    const marker = '<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>';
    html = html.replace(marker, `${marker}\n<script src="/enhancements.js?v=20260813-1"></script>`);
  }

  const headers = new Headers(asset.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-cache");
  return new Response(html, { status: asset.status, statusText: asset.statusText, headers });
}
