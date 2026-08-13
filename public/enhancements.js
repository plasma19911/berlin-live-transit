(() => {
  "use strict";

  const originalMap = L.map;
  L.map = function (...args) {
    const map = originalMap.apply(this, args);
    window.__berlinLiveMap = map;
    return map;
  };

  const originalTileLayer = L.tileLayer;
  L.tileLayer = function (url, options) {
    const layer = originalTileLayer.call(this, url, options);
    layer.__berlinBaseUrl = String(url || "");
    const originalAddTo = layer.addTo;
    layer.addTo = function (map) {
      const previous = window.__berlinBaseLayer;
      if (previous && previous !== layer && map && map.hasLayer && map.hasLayer(previous)) {
        map.removeLayer(previous);
      }
      const result = originalAddTo.call(layer, map);
      if (map === window.__berlinLiveMap) {
        window.__berlinBaseLayer = layer;
        applyMapContrast(layer.__berlinBaseUrl);
      }
      return result;
    };
    return layer;
  };

  function applyMapContrast(url) {
    const light = /light_all|openstreetmap|voyager/i.test(String(url));
    document.body?.classList.toggle("map-light", light);
  }

  const css = `
    .veh{border:2px solid rgba(255,255,255,.98)!important;box-shadow:0 0 0 1px rgba(0,0,0,.62),0 3px 9px rgba(0,0,0,.46)!important}
    .veh.kind-s{border:2px solid rgba(255,255,255,.98)!important;box-shadow:0 0 0 1px rgba(0,0,0,.62),0 3px 9px rgba(0,0,0,.46)!important}
    body.map-light .veh{box-shadow:0 0 0 2px rgba(5,10,16,.86),0 3px 9px rgba(0,0,0,.34)!important}
    body.map-light .veh-arrow{color:#fff!important;background:rgba(5,10,18,.96)!important;border:2px solid #fff!important;text-shadow:none!important;filter:none!important}
    .veh.kind-bus,.veh.kind-tram{min-width:46px!important;height:40px!important;padding:2px 5px 3px!important;border-radius:9px!important}
    .veh.kind-replacement{min-width:50px!important;height:40px!important;padding:2px 6px 3px!important;border-radius:9px!important;background:linear-gradient(135deg,#c026d3 0 72%,#7d168d 72% 100%)!important}
    .kind-bus .veh-symbol,.kind-tram .veh-symbol{font-size:0!important;min-height:10px!important;line-height:10px!important}
    .kind-bus .veh-symbol::before{content:"BUS"!important;font-size:8px!important;line-height:9px!important;font-weight:1000!important;letter-spacing:.06em!important}
    .kind-tram .veh-symbol::before{content:"TRAM"!important;font-size:8px!important;line-height:9px!important;font-weight:1000!important;letter-spacing:.04em!important}
    .kind-replacement .veh-symbol{font-size:10px!important;line-height:10px!important;min-height:11px!important;font-weight:1000!important;letter-spacing:.08em!important}
    .kind-bus .veh-line,.kind-tram .veh-line{font-size:11px!important;line-height:12px!important;max-width:44px!important;font-weight:1000!important}
    .veh-line{font-size:10px!important;line-height:11px!important;max-width:42px!important;font-weight:1000!important}
    .kind-s .veh-line,.kind-u .veh-line{font-size:8px!important}
    .legend-sign{border:2px solid rgba(255,255,255,.95)!important;box-shadow:0 0 0 1px rgba(0,0,0,.55)!important}
    .legend-sign.kind-bus,.legend-sign.kind-tram{font-size:0!important;width:34px!important}
    .legend-sign.kind-bus::before{content:"BUS";font-size:8px;font-weight:1000}
    .legend-sign.kind-tram::before{content:"TRAM";font-size:7px;font-weight:1000}
    .transport-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .transport-head h2{margin:0!important}
    .transport-toggle{display:none;width:31px!important;height:29px!important;padding:0!important;font-size:14px!important}
    .transport-panel.collapsed{padding:8px 10px!important}
    .transport-panel.collapsed .filters{display:none!important}
    .route-endpoint{background:transparent!important;border:0!important}
    .route-pin{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#101722;color:#fff;border:3px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.72),0 3px 9px rgba(0,0,0,.4);font-size:11px;font-weight:1000}
    .route-leg{display:flex;gap:7px;align-items:flex-start;padding:5px 0;border-top:1px solid rgba(255,255,255,.07)}
    .route-leg:first-child{border-top:0}
    .route-leg-badge{min-width:44px;padding:3px 5px;border-radius:7px;text-align:center;font-size:9px;font-weight:1000;background:var(--leg-color,#65758a);color:var(--leg-fg,#fff);border:1px solid rgba(255,255,255,.75)}
    body.planned-route-focus .veh{box-shadow:0 0 0 2px rgba(255,255,255,.98),0 0 0 5px rgba(5,10,16,.88),0 0 18px rgba(77,168,255,.75)!important}
    @media(max-width:700px){
      .transport-toggle{display:block}
      .side{gap:6px!important}
      body.transport-collapsed .controls{bottom:112px!important}
      body.transport-collapsed .map-style-menu{bottom:112px!important}
      body.transport-collapsed .warn{bottom:112px!important}
      body.detail-open .controls{bottom:205px!important}
      body.detail-open .map-style-menu{bottom:205px!important}
      body.detail-open .warn{bottom:205px!important}
      .veh.kind-bus,.veh.kind-tram{min-width:42px!important;height:36px!important}
      .veh.kind-replacement{min-width:46px!important;height:36px!important}
      .kind-bus .veh-line,.kind-tram .veh-line{font-size:10px!important;line-height:11px!important}
      .kind-bus .veh-symbol::before,.kind-tram .veh-symbol::before{font-size:7px!important;line-height:8px!important}
    }
    .zoom-far .kind-bus .veh-symbol::before{content:"B"!important;font-size:10px!important}
    .zoom-far .kind-tram .veh-symbol::before{content:"T"!important;font-size:10px!important}
    @media(max-width:700px){
      .detail-panel{left:8px!important;right:8px!important;top:auto!important;bottom:8px!important;width:auto!important;height:min(48vh,420px)!important;min-height:300px!important;max-height:min(48vh,420px)!important;overflow:hidden!important;border-radius:15px!important;padding:9px 10px!important}
      .detail-panel.show{display:flex!important;flex-direction:column!important}
      .detail-head{flex:0 0 auto!important;min-height:38px!important}
      #detailBody{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding-right:3px!important;padding-bottom:10px!important}
      .detail-grid{margin-top:6px!important;font-size:10px!important;grid-template-columns:86px 1fr!important;gap:4px 7px!important}
      .route-chip{white-space:normal!important;line-height:1.3!important;margin-top:7px!important}
      .detail-section{height:auto!important;max-height:none!important;overflow:visible!important;margin-top:8px!important;padding-top:7px!important}
      .detail-section h3{position:sticky!important;top:0!important;z-index:3!important;padding:5px 0!important;background:rgba(12,18,28,.98)!important;font-size:10px!important}
      .route-leg{padding:7px 0!important;font-size:10px!important;line-height:1.3!important;gap:8px!important}
      .route-leg-badge{min-width:52px!important;font-size:9px!important;padding:4px 5px!important}
      .route-leg .stop-meta{display:block!important;font-size:8.5px!important;margin-top:2px!important}
    }
  `;
  const style = document.createElement("style");
  style.id = "berlin-enhancements-css";
  style.textContent = css;
  document.head.appendChild(style);

  const routeState = { layers: [], controller: null, eligibilitySeq: 0 };
  const routeFocusState = { active: false, paneDisplays: new Map() };

  function ensurePlannerPanes(map) {
    const panes = [
      ["plannerRouteHaloPane", "650"],
      ["plannerRoutePane", "660"],
      ["plannerVehiclePane", "690"],
      ["plannerStopPane", "820"]
    ];
    for (const [name, z] of panes) {
      if (!map.getPane(name)) map.createPane(name);
      const pane = map.getPane(name);
      pane.style.zIndex = z;
      pane.style.pointerEvents = "none";
    }
  }

  function setRouteFocus(active) {
    const map = window.__berlinLiveMap;
    if (!map) return;
    ensurePlannerPanes(map);
    const names = ["routeHaloPane", "routePane", "tripStopPane"];
    if (active && !routeFocusState.active) {
      routeFocusState.paneDisplays.clear();
      for (const name of names) {
        const pane = map.getPane(name);
        if (!pane) continue;
        routeFocusState.paneDisplays.set(name, pane.style.display || "");
        pane.style.display = "none";
      }
      routeFocusState.active = true;
      document.body.classList.add("planned-route-focus");
    } else if (!active && routeFocusState.active) {
      for (const name of names) {
        const pane = map.getPane(name);
        if (pane) pane.style.display = routeFocusState.paneDisplays.get(name) || "";
      }
      routeFocusState.paneDisplays.clear();
      routeFocusState.active = false;
      document.body.classList.remove("planned-route-focus");
    }
  }
  const modeInfo = {
    suburban: { c: "#008d4c", fg: "#fff", label: "S" },
    subway: { c: "#0067b1", fg: "#fff", label: "U" },
    tram: { c: "#ff8a00", fg: "#111", label: "TRAM" },
    bus: { c: "#f6c900", fg: "#111", label: "BUS" },
    replacement: { c: "#c026d3", fg: "#fff", label: "SEV" },
    ferry: { c: "#0077a8", fg: "#fff", label: "F" },
    regional: { c: "#e2001a", fg: "#fff", label: "RE" },
    express: { c: "#e2001a", fg: "#fff", label: "ICE" }
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

  function fmtTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  function parseRouteSearch(text) {
    const q = String(text || "").trim();
    let m = q.match(/^von\s+(.+?)\s+nach\s+(.+)$/i);
    if (m) return { from: m[1].trim(), to: m[2].trim() };
    m = q.match(/^(.+?\d.*?)\s+nach\s+(.+)$/i);
    if (m) return { from: m[1].trim(), to: m[2].trim() };
    for (const sep of ["→", "->", "=>", " > "]) {
      const i = q.indexOf(sep);
      if (i > 0) return { from: q.slice(0, i).trim(), to: q.slice(i + sep.length).trim() };
    }
    return null;
  }

  function flattenPolyline(poly) {
    const out = [];
    const walk = x => {
      if (!x) return;
      if (Array.isArray(x) && x.length >= 2 && typeof x[0] === "number" && typeof x[1] === "number") {
        out.push([Number(x[1]), Number(x[0])]);
        return;
      }
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x.coordinates) walk(x.coordinates);
      if (x.geometry) walk(x.geometry);
      if (Array.isArray(x.features)) x.features.forEach(walk);
    };
    walk(poly);
    return out.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  }

  function legPoint(place) {
    const p = place?.location || place;
    const lat = Number(p?.latitude), lon = Number(p?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }

  function legProduct(leg) {
    if (leg?.walking) return "walking";
    const remarks = Array.isArray(leg?.remarks) ? leg.remarks.map(r => r?.text || r?.summary || r?.code || "").join(" ") : "";
    const text = [leg?.line?.name, leg?.line?.id, leg?.direction, leg?.destination?.name, remarks].filter(Boolean).join(" ").toUpperCase();
    if (/\bSEV\b|SCHIENENERSATZVERKEHR|ERSATZVERKEHR|ERSATZBUS/.test(text)) return "replacement";
    const p = leg?.line?.product;
    return modeInfo[p] ? p : "regional";
  }

  function normRouteValue(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
  }

  function normRouteLine(value) {
    return normRouteValue(value).replace(/^(bus|tram|strassenbahn|sbahn|ubahn|regionalbahn|regionalexpress|express)+/, "");
  }

  function modeCompatible(a, b) {
    if (!a || !b || a === b) return true;
    if ((a === "replacement" && b === "bus") || (a === "bus" && b === "replacement")) return true;
    const railA = a === "regional" || a === "express";
    const railB = b === "regional" || b === "express";
    return railA && railB;
  }

  function sameRouteLine(vehicle, leg) {
    if (!vehicle || !leg || !modeCompatible(vehicle.mode, leg.mode)) return false;
    const raw = vehicle.raw || {};
    const live = [vehicle.line, raw.line?.name, raw.line?.id].map(normRouteLine).filter(Boolean);
    const planned = [leg.line, leg.lineId].map(normRouteLine).filter(Boolean);
    return live.some(v => planned.some(p => v === p || (v.length > 1 && p.length > 1 && (v.endsWith(p) || p.endsWith(v)))));
  }

  function placeId(place) {
    return String(place?.id || place?.stop?.id || place?.station?.id || "");
  }

  function placeName(place) {
    return String(place?.name || place?.stop?.name || place?.station?.name || place?.address || "");
  }

  function placePoint(place) {
    const p = place?.location || place?.stop?.location || place?.station?.location || place;
    const lat = Number(p?.latitude ?? p?.lat), lon = Number(p?.longitude ?? p?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }

  function distanceMeters(a, b) {
    if (!a || !b) return Infinity;
    const [lat1, lon1] = a.map(Number), [lat2, lon2] = b.map(Number);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
    const R = 6371000;
    const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function stopMatches(stopover, id, name, lat, lon) {
    const stop = stopover?.stop || stopover;
    const sid = placeId(stop);
    if (id && sid && String(id) === sid) return true;
    const a = normRouteValue(placeName(stop));
    const b = normRouteValue(name);
    if (a && b && (a === b || (a.length > 5 && b.length > 5 && (a.includes(b) || b.includes(a))))) return true;
    const p = placePoint(stop);
    return p && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && distanceMeters(p, [Number(lat), Number(lon)]) <= 280;
  }

  function stopTimeMs(stopover) {
    for (const value of [stopover?.departure, stopover?.arrival, stopover?.plannedDeparture, stopover?.plannedArrival]) {
      const ms = new Date(value || 0).getTime();
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    return NaN;
  }

  const liveTripCache = new Map();
  async function fetchLiveTrip(tripId) {
    const id = String(tripId || "");
    if (!id) return null;
    const cached = liveTripCache.get(id);
    if (cached && Date.now() - cached.at < 20000) return cached.trip;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const r = await fetch(`/api/trip?id=${encodeURIComponent(id)}`, {
        cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal: controller.signal
      });
      if (!r.ok) return null;
      const json = await r.json();
      const trip = json?.trip || json;
      liveTripCache.set(id, { at: Date.now(), trip });
      return trip;
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function tripStillReachesLeg(trip, leg) {
    const stops = Array.isArray(trip?.stopovers) ? trip.stopovers : [];
    if (!stops.length) return null;

    const boardIndexes = [];
    const alightIndexes = [];
    for (let i = 0; i < stops.length; i++) {
      if (stopMatches(stops[i], leg.boardId, leg.boardName, leg.boardLat, leg.boardLon)) boardIndexes.push(i);
      if (stopMatches(stops[i], leg.alightId, leg.alightName, leg.alightLat, leg.alightLon)) alightIndexes.push(i);
    }
    if (!boardIndexes.length || !alightIndexes.length) return null;

    const now = Date.now();
    for (const bi of boardIndexes) {
      const ai = alightIndexes.find(x => x > bi);
      if (ai == null) continue; // wrong direction: destination occurs before boarding stop
      const boardTime = stopTimeMs(stops[bi]);
      // A short grace period keeps a delayed vehicle visible around the boarding stop.
      if (!Number.isFinite(boardTime) || boardTime >= now - 5 * 60 * 1000) return true;
    }
    return false;
  }

  function directionLooksCompatible(vehicle, leg) {
    const raw = vehicle?.raw || {};
    const liveDir = normRouteValue(raw.direction || raw.destination?.name || raw.destination || "");
    const plannedDir = normRouteValue(leg?.direction || "");
    return !liveDir || !plannedDir || liveDir.includes(plannedDir) || plannedDir.includes(liveDir);
  }

  async function refreshRouteLiveEligibility() {
    const filter = window.__berlinPlannedVehicleFilter;
    const liveState = window.__berlinLiveState;
    const map = window.__berlinLiveMap;
    const seq = ++routeState.eligibilitySeq;

    if (!filter?.active || !Array.isArray(filter.legs) || !filter.legs.length || !liveState?.vehicles) {
      window.__berlinRouteEligibility = { active: false, ready: true, ids: new Set() };
      return;
    }

    const eligible = new Set();
    const provisional = new Set();
    const jobs = [];
    const now = Date.now();

    for (const [vehicleId, vehicle] of liveState.vehicles.entries()) {
      const matchingLegs = filter.legs.filter(leg => sameRouteLine(vehicle, leg));
      if (!matchingLegs.length) continue;

      const raw = vehicle.raw || {};
      const liveTripId = String(raw.tripId || raw.journeyId || raw.trip?.id || "");

      // Exact planned trip: show immediately if its boarding time has not passed.
      const exact = matchingLegs.some(leg => {
        if (!liveTripId || !leg.tripId || liveTripId !== String(leg.tripId)) return false;
        const dep = new Date(leg.departure || 0).getTime();
        return !Number.isFinite(dep) || dep >= now - 2 * 60 * 1000;
      });
      if (exact) {
        eligible.add(vehicleId);
        provisional.add(vehicleId);
        continue;
      }

      const directionFallback = matchingLegs.some(leg => directionLooksCompatible(vehicle, leg));

      // Without a trip id we cannot inspect the future stop sequence. Use a conservative
      // same-line + same-direction fallback rather than hiding a potentially useful live bus/train.
      if (!liveTripId) {
        if (directionFallback) {
          eligible.add(vehicleId);
          provisional.add(vehicleId);
        }
        continue;
      }

      if (directionFallback) provisional.add(vehicleId);
      jobs.push({ vehicleId, liveTripId, matchingLegs, directionFallback });
    }

    window.__berlinRouteEligibility = { active: true, ready: true, ids: provisional };
    if (map) map.fire("moveend");

    // Limit concurrent trip lookups on mobile while still validating every candidate.
    let cursor = 0;
    const workers = Array.from({ length: Math.min(6, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        const trip = await fetchLiveTrip(job.liveTripId);
        if (seq !== routeState.eligibilitySeq) return;
        if (!trip) {
          if (job.directionFallback) eligible.add(job.vehicleId);
          continue;
        }
        let confirmed = false;
        let unknown = false;
        for (const leg of job.matchingLegs) {
          const status = tripStillReachesLeg(trip, leg);
          if (status === true) { confirmed = true; break; }
          if (status === null) unknown = true;
        }
        if (confirmed || (unknown && job.directionFallback)) eligible.add(job.vehicleId);
      }
    });
    await Promise.all(workers);
    if (seq !== routeState.eligibilitySeq) return;

    window.__berlinRouteEligibility = { active: true, ready: true, ids: eligible };
    if (eligible.size) filter.fitVehiclesOnce = true;
    if (map) map.fire("moveend");
  }

  let eligibilityTimer = null;
  window.addEventListener("berlin-live-vehicles-updated", () => {
    clearTimeout(eligibilityTimer);
    eligibilityTimer = setTimeout(refreshRouteLiveEligibility, 120);
  });

  function clearPlannedRoute() {
    if (routeState.controller) {
      try { routeState.controller.abort(); } catch (_) {}
      routeState.controller = null;
    }
    const map = window.__berlinLiveMap;
    if (map) for (const layer of routeState.layers) if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    routeState.eligibilitySeq++;
    routeState.layers = [];
    window.__berlinPlannedVehicleFilter={active:false,legs:[]};
    window.__berlinRouteEligibility={active:false,ready:true,ids:new Set()};
    setRouteFocus(false);
    if(map)map.fire("moveend");
  }

  function durationText(journey) {
    const legs = Array.isArray(journey?.legs) ? journey.legs : [];
    if (!legs.length) return "—";
    const a = new Date(legs[0]?.departure || legs[0]?.plannedDeparture || 0).getTime();
    const b = new Date(legs.at(-1)?.arrival || legs.at(-1)?.plannedArrival || 0).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return "—";
    const min = Math.round((b - a) / 60000);
    return min >= 60 ? `${Math.floor(min / 60)} Std ${min % 60} Min` : `${min} Min`;
  }

  async function planRoute(from, to) {
    const map = window.__berlinLiveMap;
    if (!map) return;
    clearPlannedRoute();
    const controller = new AbortController();
    routeState.controller = controller;

    const panel = $("detailPanel"), title = $("detailTitle"), sub = $("detailSub"), body = $("detailBody");
    panel?.classList.add("show");
    document.body.classList.add("detail-open");
    if (title) title.textContent = "🧭 Verbindungen · nächste 60 Min";
    if (sub) sub.textContent = `${from} → ${to}`;
    if (body) body.innerHTML = '<div class="detail-loading">Adresse und Verbindungen der nächsten 60 Minuten werden gesucht …</div>';

    try {
      const response = await fetch(`/api/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
        cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" }
      });
      const text = await response.text();
      if (!response.ok) {
        let msg = text;
        try { msg = JSON.parse(text)?.error || msg; } catch (_) {}
        throw new Error(String(msg).slice(0, 220));
      }
      const data = JSON.parse(text);
      const journey = data?.journey;
      const legs = Array.isArray(journey?.legs) ? journey.legs : [];
      if (!legs.length) throw new Error("Keine Verbindung gefunden.");
      const hourJourneys = Array.isArray(data?.journeysWithinHour) && data.journeysWithinHour.length
        ? data.journeysWithinHour
        : [journey];

      setRouteFocus(true);
      ensurePlannerPanes(map);
      const bounds = L.latLngBounds([]), layers = [];
      const transitLegs = legs.filter(l => l?.line && !l?.walking);
      const relevantVehicleLegs=[];
      const relevantVehicleKeys=new Set();

      const registerRelevantLeg=(leg,coordsHint=null)=>{
        if(!leg?.line||leg?.walking)return;
        let coords=Array.isArray(coordsHint)&&coordsHint.length>=2?coordsHint:flattenPolyline(leg?.polyline);
        if(coords.length<2){
          const a=legPoint(leg?.origin),b=legPoint(leg?.destination);
          if(a&&b)coords=[a,b];
        }
        if(coords.length<2)return;
        const product=legProduct(leg);
        const lats=coords.map(p=>Number(p[0])).filter(Number.isFinite);
        const lons=coords.map(p=>Number(p[1])).filter(Number.isFinite);
        const first=coords[0],last=coords[coords.length-1];
        const toRad=x=>Number(x)*Math.PI/180;
        const toDeg=x=>Number(x)*180/Math.PI;
        const y=Math.sin(toRad(last[1]-first[1]))*Math.cos(toRad(last[0]));
        const x=Math.cos(toRad(first[0]))*Math.sin(toRad(last[0]))-Math.sin(toRad(first[0]))*Math.cos(toRad(last[0]))*Math.cos(toRad(last[1]-first[1]));
        const legBearing=(toDeg(Math.atan2(y,x))+360)%360;
        const boarding=legPoint(leg?.origin);
        const alighting=legPoint(leg?.destination);
        const tripId=String(leg?.tripId||leg?.trip?.id||"");
        const line=String(leg?.line?.name||leg?.line?.id||"");
        const lineId=String(leg?.line?.id||"");
        const departure=String(leg?.departure||leg?.plannedDeparture||"");
        const boardId=String(leg?.origin?.id||leg?.origin?.stop?.id||"");
        const boardName=String(leg?.origin?.name||leg?.origin?.address||"");
        const alightId=String(leg?.destination?.id||leg?.destination?.stop?.id||"");
        const alightName=String(leg?.destination?.name||leg?.destination?.address||"");
        const key=tripId||[product,line,lineId,departure,boardName].join("|");
        if(relevantVehicleKeys.has(key))return;
        relevantVehicleKeys.add(key);
        const padLat=.018,padLon=.030;
        relevantVehicleLegs.push({
          line,lineId,mode:product,
          direction:String(leg?.direction||leg?.destination?.name||""),
          tripId,departure,boardId,boardName,alightId,alightName,
          boardLat:boarding?Number(boarding[0]):null,
          boardLon:boarding?Number(boarding[1]):null,
          alightLat:alighting?Number(alighting[0]):null,
          alightLon:alighting?Number(alighting[1]):null,
          bearing:Number.isFinite(legBearing)?legBearing:null,
          minLat:lats.length?Math.min(...lats)-padLat:null,
          maxLat:lats.length?Math.max(...lats)+padLat:null,
          minLon:lons.length?Math.min(...lons)-padLon:null,
          maxLon:lons.length?Math.max(...lons)+padLon:null
        });
      };

      for (const leg of legs) {
        let coords = flattenPolyline(leg?.polyline);
        if (coords.length < 2) {
          const a = legPoint(leg?.origin), b = legPoint(leg?.destination);
          if (a && b) coords = [a, b];
        }
        if (coords.length < 2) continue;
        coords.forEach(p => bounds.extend(p));
        const product = legProduct(leg), walking = product === "walking";
        if(!walking&&leg?.line)registerRelevantLeg(leg,coords);
        const color = walking ? "#e7eef7" : (modeInfo[product]?.c || "#4da8ff");
        const halo = L.polyline(coords, { pane: "plannerRouteHaloPane", color: "#071019", weight: walking ? 7 : 10, opacity: .84, lineCap: "round", lineJoin: "round", interactive: false, dashArray: walking ? "4 7" : null }).addTo(map);
        const line = L.polyline(coords, { pane: "plannerRoutePane", color, weight: walking ? 3 : 6, opacity: 1, lineCap: "round", lineJoin: "round", interactive: false, dashArray: walking ? "4 7" : null }).addTo(map);
        layers.push(halo, line);
      }

      // Alle ÖPNV-Teilstrecken aller Verbindungen sammeln, deren Start in den nächsten 60 Minuten liegt.
      // So können gleichzeitig der kommende Zubringer, spätere Umstiegsbahnen und weitere nutzbare Abfahrten live sichtbar sein.
      for(const option of hourJourneys){
        for(const optionLeg of (Array.isArray(option?.legs)?option.legs:[])){
          registerRelevantLeg(optionLeg);
        }
      }

      const start = legPoint(data?.from) || legPoint(legs[0]?.origin);
      const end = legPoint(data?.to) || legPoint(legs.at(-1)?.destination);
      const endpoint = letter => L.divIcon({ className: "route-endpoint", html: `<div class="route-pin">${letter}</div>`, iconSize: [30,30], iconAnchor: [15,15] });
      if (start) { bounds.extend(start); layers.push(L.marker(start, { pane: "plannerStopPane", icon: endpoint("A") }).addTo(map)); }
      if (end) { bounds.extend(end); layers.push(L.marker(end, { pane: "plannerStopPane", icon: endpoint("B") }).addTo(map)); }
      routeState.layers = layers;
      window.__berlinPlannedVehicleFilter={
        active:true,
        legs:relevantVehicleLegs,
        journeyCount:hourJourneys.length,
        windowMinutes:Number(data?.routeWindowMinutes)||60,
        fitVehiclesOnce:true,
        routeBounds:bounds.isValid()?{south:bounds.getSouth(),west:bounds.getWest(),north:bounds.getNorth(),east:bounds.getEast()}:null
      };
      window.__berlinRouteEligibility={active:true,ready:false,ids:new Set()};
      refreshRouteLiveEligibility();
      if (bounds.isValid()) map.fitBounds(bounds.pad(.08), { maxZoom: 15, paddingTopLeft: [20,70], paddingBottomRight: [20, innerWidth <= 700 ? 205 : 20] });
      else map.fire("moveend");

      const transfers = Math.max(0, transitLegs.length - 1);
      const dep = legs[0]?.departure || legs[0]?.plannedDeparture;
      const arr = legs.at(-1)?.arrival || legs.at(-1)?.plannedArrival;
      const legRows = legs.map(leg => {
        if (leg?.walking) {
          const a = leg?.origin?.name || leg?.origin?.address || "Start";
          const b = leg?.destination?.name || leg?.destination?.address || "Ziel";
          return `<div class="route-leg"><span class="route-leg-badge" style="--leg-color:#65758a">ZU FUSS</span><div>${esc(a)} → ${esc(b)}</div></div>`;
        }
        const product = legProduct(leg), info = modeInfo[product] || modeInfo.regional;
        return `<div class="route-leg"><span class="route-leg-badge" style="--leg-color:${info.c};--leg-fg:${info.fg}">${esc(leg?.line?.name || info.label)}</span><div><b>${esc(leg?.origin?.name || "")}</b> → ${esc(leg?.destination?.name || leg?.direction || "")}<div class="stop-meta">${fmtTime(leg?.departure || leg?.plannedDeparture)} – ${fmtTime(leg?.arrival || leg?.plannedArrival)}</div></div></div>`;
      }).join("");
      if (body) body.innerHTML = `<div class="detail-grid"><div class="detail-key">Beste Dauer</div><div><b>${durationText(journey)}</b></div><div class="detail-key">Abfahrt</div><div>${fmtTime(dep)}</div><div class="detail-key">Ankunft</div><div>${fmtTime(arr)}</div><div class="detail-key">Umstiege</div><div>${transfers}</div><div class="detail-key">Verbindungen +60 Min</div><div><b>${hourJourneys.length}</b></div></div><div class="route-chip"><span class="route-line-sample"></span><span>Echte Live-Fahrzeuge, die deinen Einstieg noch erreichen · bis zum Ziel</span></div><div class="detail-section"><h3>Beste Strecke</h3>${legRows}</div>`;
    } catch (error) {
      if (error?.name === "AbortError") return;
      clearPlannedRoute();
      console.error("Adress-Routing:", error);
      if (body) body.innerHTML = `<div class="note">Route konnte nicht berechnet werden: ${esc(error?.message || error)}</div>`;
    } finally {
      if (routeState.controller === controller) routeState.controller = null;
    }
  }

  // Map styles are owned exclusively by public/index.html.
  // Keeping a second satellite handler here caused competing tile layers.
  function setupMapStyles() {
    return;
  }

  function setupTransportPanel() {
    const filters = $("filters");
    const panel = filters?.closest(".panel");
    if (!filters || !panel || panel.classList.contains("transport-panel")) return;
    panel.id = "transportPanel";
    panel.classList.add("transport-panel");
    const h2 = panel.querySelector("h2");
    const head = document.createElement("div");
    head.className = "transport-head";
    if (h2) { panel.insertBefore(head, h2); head.appendChild(h2); }
    else panel.prepend(head);
    const button = document.createElement("button");
    button.id = "transportToggle";
    button.className = "btn transport-toggle";
    button.type = "button";
    head.appendChild(button);

    const setCollapsed = collapsed => {
      panel.classList.toggle("collapsed", collapsed);
      document.body.classList.toggle("transport-collapsed", collapsed && innerWidth <= 700);
      button.textContent = collapsed ? "▴" : "▾";
      button.title = collapsed ? "Verkehrsmittel anzeigen" : "Verkehrsmittel minimieren";
      button.setAttribute("aria-expanded", String(!collapsed));
      try { localStorage.setItem("berlin-live-transit-transport-collapsed", collapsed ? "1" : "0"); } catch (_) {}
    };
    let collapsed = innerWidth <= 700;
    try { const saved = localStorage.getItem("berlin-live-transit-transport-collapsed"); if (saved !== null && innerWidth <= 700) collapsed = saved === "1"; } catch (_) {}
    setCollapsed(collapsed);
    button.addEventListener("click", () => setCollapsed(!panel.classList.contains("collapsed")));
  }

  function setupSearch() {
    const input = $("q"), search = $("search");
    if (!input || !search) return;
    input.placeholder = "U8 oder Straße 1 → Straße 2";
    const intercept = event => {
      const route = parseRouteSearch(input.value);
      if (!route) return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      planRoute(route.from, route.to);
      return true;
    };
    search.addEventListener("click", intercept, true);
    input.addEventListener("keydown", e => { if (e.key === "Enter") intercept(e); }, true);
    $("clearRoutes")?.addEventListener("click", clearPlannedRoute, true);
    $("detailClose")?.addEventListener("click", () => { if (window.__berlinPlannedVehicleFilter?.active) clearPlannedRoute(); }, true);
    const clear = $("clearRoutes");
    if (clear) clear.title = "Ausgewählte Linien und geplante Route löschen";
  }

  function start() {
    // duplicate map-style controller disabled; main index handles all base layers
    setupTransportPanel();
    setupSearch();
  }

  setTimeout(start, 0);
})();
