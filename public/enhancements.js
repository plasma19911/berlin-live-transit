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
    body.map-light .veh-arrow{color:#111!important;text-shadow:0 0 2px #fff,0 0 4px #fff,0 1px 2px #fff!important;filter:none!important}
    .veh.kind-bus,.veh.kind-tram{min-width:46px!important;height:40px!important;padding:2px 5px 3px!important;border-radius:9px!important}
    .kind-bus .veh-symbol,.kind-tram .veh-symbol{font-size:0!important;min-height:10px!important;line-height:10px!important}
    .kind-bus .veh-symbol::before{content:"BUS"!important;font-size:8px!important;line-height:9px!important;font-weight:1000!important;letter-spacing:.06em!important}
    .kind-tram .veh-symbol::before{content:"TRAM"!important;font-size:8px!important;line-height:9px!important;font-weight:1000!important;letter-spacing:.04em!important}
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
    .planned-vehicle-icon{background:transparent!important;border:0!important;overflow:visible!important}
    .planned-vehicle-card{min-width:72px;padding:5px 7px;border-radius:10px;background:rgba(11,18,27,.94);border:2px dashed rgba(255,255,255,.9);box-shadow:0 3px 12px rgba(0,0,0,.55);color:#fff;text-align:center;font-family:Inter,system-ui,sans-serif;line-height:1.05}
    .planned-vehicle-card .pv-mode{display:block;font-size:7px;font-weight:1000;letter-spacing:.08em;color:var(--pv-color,#4da8ff)}
    .planned-vehicle-card .pv-line{display:block;font-size:12px;font-weight:1000;margin-top:2px}
    .planned-vehicle-card .pv-time{display:block;font-size:8px;font-weight:800;color:#d9e5f2;margin-top:3px}
    .planned-vehicle-card .pv-count{display:inline-block;margin-left:3px;padding:1px 4px;border-radius:8px;background:rgba(77,168,255,.22);font-size:8px}
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
      .kind-bus .veh-line,.kind-tram .veh-line{font-size:10px!important;line-height:11px!important}
      .kind-bus .veh-symbol::before,.kind-tram .veh-symbol::before{font-size:7px!important;line-height:8px!important}
    }
    .zoom-far .kind-bus .veh-symbol::before{content:"B"!important;font-size:10px!important}
    .zoom-far .kind-tram .veh-symbol::before{content:"T"!important;font-size:10px!important}
  `;
  const style = document.createElement("style");
  style.id = "berlin-enhancements-css";
  style.textContent = css;
  document.head.appendChild(style);

  const routeState = { layers: [], controller: null, plannedVehicleLayer: null };
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
    const p = leg?.line?.product;
    return modeInfo[p] ? p : "regional";
  }

  function normRouteValue(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
  }

  function normRouteLine(value) {
    return normRouteValue(value).replace(/^(bus|tram|strassenbahn|sbahn|ubahn|regionalbahn|regionalexpress|express)+/, "");
  }

  function liveVehicleMatchesLeg(vehicle, leg) {
    if (!vehicle || !leg) return false;
    const raw = vehicle.raw || {};
    const liveTrip = String(raw.tripId || raw.journeyId || raw.trip?.id || "");
    const plannedTrip = String(leg.tripId || "");
    if (liveTrip && plannedTrip) return liveTrip === plannedTrip;

    const liveLine = normRouteLine(vehicle.line || raw.line?.name || raw.line?.id);
    const plannedLine = normRouteLine(leg.line || leg.lineId);
    if (!liveLine || !plannedLine || liveLine !== plannedLine) return false;
    if (leg.mode && vehicle.mode && leg.mode !== vehicle.mode) return false;

    const liveDirection = normRouteValue(raw.direction || raw.destination?.name || raw.destination || "");
    const plannedDirection = normRouteValue(leg.direction || "");
    return !liveDirection || !plannedDirection || liveDirection.includes(plannedDirection) || plannedDirection.includes(liveDirection);
  }

  function syncPlannedVehicleMarkers() {
    const map = window.__berlinLiveMap;
    if (!map) return;
    ensurePlannerPanes(map);
    if (routeState.plannedVehicleLayer && map.hasLayer(routeState.plannedVehicleLayer)) {
      map.removeLayer(routeState.plannedVehicleLayer);
    }
    routeState.plannedVehicleLayer = null;

    const filter = window.__berlinPlannedVehicleFilter;
    if (!filter?.active || !Array.isArray(filter.legs) || !filter.legs.length) return;
    const live = [...(window.__berlinLiveState?.vehicles?.values?.() || [])];
    const groups = new Map();

    for (const leg of filter.legs) {
      const lat = Number(leg.boardLat), lon = Number(leg.boardLon);
      if (![lat, lon].every(Number.isFinite)) continue;
      if (live.some(v => liveVehicleMatchesLeg(v, leg))) continue;

      const dep = new Date(leg.departure || 0);
      const depMs = dep.getTime();
      // Old scheduled trips are not useful; keep a short grace period for late realtime updates.
      if (Number.isFinite(depMs) && depMs < Date.now() - 5 * 60 * 1000) continue;

      const key = [leg.mode || "regional", normRouteLine(leg.line || leg.lineId), lat.toFixed(5), lon.toFixed(5)].join("|");
      if (!groups.has(key)) groups.set(key, { leg, lat, lon, times: [], trips: [] });
      const g = groups.get(key);
      g.times.push(Number.isFinite(depMs) ? fmtTime(dep) : "—");
      if (leg.tripId) g.trips.push(String(leg.tripId));
    }

    const markers = [];
    for (const g of groups.values()) {
      g.times = [...new Set(g.times)].sort();
      const leg = g.leg;
      const info = modeInfo[leg.mode] || modeInfo.regional;
      const line = String(leg.line || leg.lineId || info.label || "?");
      const count = g.times.length;
      const firstTime = g.times[0] || "—";
      const countHtml = count > 1 ? `<span class="pv-count">×${count}</span>` : "";
      const html = `<div class="planned-vehicle-card" style="--pv-color:${info.c}"><span class="pv-mode">⏱ GEPLANT · ${esc(info.label)}</span><span class="pv-line">${esc(line)}${countHtml}</span><span class="pv-time">ab ${esc(firstTime)}</span></div>`;
      const icon = L.divIcon({ className: "planned-vehicle-icon", html, iconSize: [82, 48], iconAnchor: [41, 24] });
      const marker = L.marker([g.lat, g.lon], { pane: "plannerVehiclePane", icon, keyboard: false, interactive: true });
      marker.bindTooltip(`<b>GEPLANT · ${esc(info.label)} ${esc(line)}</b><br>Ab Einstieg: ${g.times.map(esc).join(", ")}<br><span style="opacity:.75">Noch keine echte Live-Position im Radar.</span>`, { direction: "top", offset: [0, -20] });
      markers.push(marker);
    }
    if (markers.length) routeState.plannedVehicleLayer = L.layerGroup(markers).addTo(map);
  }

  window.addEventListener("berlin-live-vehicles-updated", syncPlannedVehicleMarkers);

  function clearPlannedRoute() {
    if (routeState.controller) {
      try { routeState.controller.abort(); } catch (_) {}
      routeState.controller = null;
    }
    const map = window.__berlinLiveMap;
    if (map) for (const layer of routeState.layers) if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    if (map && routeState.plannedVehicleLayer && map.hasLayer(routeState.plannedVehicleLayer)) map.removeLayer(routeState.plannedVehicleLayer);
    routeState.plannedVehicleLayer = null;
    routeState.layers = [];
    window.__berlinPlannedVehicleFilter={active:false,legs:[]};
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
        const tripId=String(leg?.tripId||leg?.trip?.id||"");
        const line=String(leg?.line?.name||leg?.line?.id||"");
        const lineId=String(leg?.line?.id||"");
        const departure=String(leg?.departure||leg?.plannedDeparture||"");
        const boardName=String(leg?.origin?.name||leg?.origin?.address||"");
        const key=tripId||[product,line,lineId,departure,boardName].join("|");
        if(relevantVehicleKeys.has(key))return;
        relevantVehicleKeys.add(key);
        const padLat=.018,padLon=.030;
        relevantVehicleLegs.push({
          line,lineId,mode:product,
          direction:String(leg?.direction||leg?.destination?.name||""),
          tripId,departure,boardName,
          boardLat:boarding?Number(boarding[0]):null,
          boardLon:boarding?Number(boarding[1]):null,
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
      syncPlannedVehicleMarkers();
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
      if (body) body.innerHTML = `<div class="detail-grid"><div class="detail-key">Beste Dauer</div><div><b>${durationText(journey)}</b></div><div class="detail-key">Abfahrt</div><div>${fmtTime(dep)}</div><div class="detail-key">Ankunft</div><div>${fmtTime(arr)}</div><div class="detail-key">Umstiege</div><div>${transfers}</div><div class="detail-key">Verbindungen +60 Min</div><div><b>${hourJourneys.length}</b></div></div><div class="route-chip"><span class="route-line-sample"></span><span>Alle passenden Live-Fahrzeuge bis zum Ziel · Start innerhalb der nächsten 60 Min</span></div><div class="detail-section"><h3>Beste Strecke</h3>${legRows}</div>`;
    } catch (error) {
      if (error?.name === "AbortError") return;
      clearPlannedRoute();
      console.error("Adress-Routing:", error);
      if (body) body.innerHTML = `<div class="note">Route konnte nicht berechnet werden: ${esc(error?.message || error)}</div>`;
    } finally {
      if (routeState.controller === controller) routeState.controller = null;
    }
  }

  function switchToSatellite() {
    const map = window.__berlinLiveMap;
    if (!map) return;
    const layer = L.tileLayer("https://wi.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Sources: Esri, Maxar, Earthstar Geographics, GIS User Community"
    });
    layer.addTo(map);
    document.body.classList.remove("map-light");
    document.querySelectorAll("[data-map-style]").forEach(b => b.classList.toggle("active", b.dataset.mapStyle === "satellite"));
    const toggle = $("mapStyleToggle"), menu = $("mapStyleMenu");
    if (toggle) { toggle.title = "Kartenansicht: Satellit"; toggle.classList.remove("active"); toggle.setAttribute("aria-expanded", "false"); }
    menu?.classList.remove("show");
    try { localStorage.setItem("berlin-live-transit-map-style", "satellite"); } catch (_) {}
  }

  function setupMapStyles() {
    const menu = $("mapStyleMenu");
    if (!menu) return;
    menu.querySelector('[data-map-style="minimal"]')?.remove();
    if (!menu.querySelector('[data-map-style="satellite"]')) {
      const list = menu.querySelector(".map-style-list") || menu;
      const button = document.createElement("button");
      button.className = "map-style-option";
      button.type = "button";
      button.dataset.mapStyle = "satellite";
      button.setAttribute("role", "menuitem");
      button.innerHTML = '<span class="map-style-icon">🛰️</span><span><span class="map-style-name">Satellit</span><span class="map-style-sub">Luft- und Satellitenbilder</span></span>';
      list.appendChild(button);
    }
    menu.addEventListener("click", e => {
      const button = e.target.closest('[data-map-style="satellite"]');
      if (!button) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      switchToSatellite();
    }, true);
    try { if (localStorage.getItem("berlin-live-transit-map-style") === "satellite") switchToSatellite(); } catch (_) {}
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
    setupMapStyles();
    setupTransportPanel();
    setupSearch();
  }

  setTimeout(start, 0);
})();
