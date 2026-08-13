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

  const routeState = { layers: [], controller: null };
  const routeFocusState = { active: false, paneDisplays: new Map() };

  function ensurePlannerPanes(map) {
    const panes = [
      ["plannerRouteHaloPane", "650"],
      ["plannerRoutePane", "660"],
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

  function clearPlannedRoute() {
    if (routeState.controller) {
      try { routeState.controller.abort(); } catch (_) {}
      routeState.controller = null;
    }
    const map = window.__berlinLiveMap;
    if (map) for (const layer of routeState.layers) if (layer && map.hasLayer(layer)) map.removeLayer(layer);
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
    if (title) title.textContent = "🧭 Beste Verbindung";
    if (sub) sub.textContent = `${from} → ${to}`;
    if (body) body.innerHTML = '<div class="detail-loading">Adresse und beste Verbindung werden gesucht …</div>';

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

      setRouteFocus(true);
      ensurePlannerPanes(map);
      const bounds = L.latLngBounds([]), layers = [];
      const transitLegs = legs.filter(l => l?.line && !l?.walking);
      const relevantVehicleLegs=[];
      for (const leg of legs) {
        let coords = flattenPolyline(leg?.polyline);
        if (coords.length < 2) {
          const a = legPoint(leg?.origin), b = legPoint(leg?.destination);
          if (a && b) coords = [a, b];
        }
        if (coords.length < 2) continue;
        coords.forEach(p => bounds.extend(p));
        const product = legProduct(leg), walking = product === "walking";
        if(!walking&&leg?.line){
          const lats=coords.map(p=>Number(p[0])).filter(Number.isFinite);
          const lons=coords.map(p=>Number(p[1])).filter(Number.isFinite);
          const padLat=.018;
          const padLon=.030;
          const first=coords[0], last=coords[coords.length-1];
          const toRad=x=>Number(x)*Math.PI/180;
          const toDeg=x=>Number(x)*180/Math.PI;
          const y=Math.sin(toRad(last[1]-first[1]))*Math.cos(toRad(last[0]));
          const x=Math.cos(toRad(first[0]))*Math.sin(toRad(last[0]))-Math.sin(toRad(first[0]))*Math.cos(toRad(last[0]))*Math.cos(toRad(last[1]-first[1]));
          const legBearing=(toDeg(Math.atan2(y,x))+360)%360;
          const boarding=legPoint(leg?.origin);
          relevantVehicleLegs.push({
            line:String(leg?.line?.name||leg?.line?.id||""),
            lineId:String(leg?.line?.id||""),
            mode:product,
            direction:String(leg?.direction||leg?.destination?.name||""),
            tripId:String(leg?.tripId||leg?.trip?.id||""),
            departure:String(leg?.departure||leg?.plannedDeparture||""),
            boardName:String(leg?.origin?.name||leg?.origin?.address||""),
            boardLat:boarding?Number(boarding[0]):null,
            boardLon:boarding?Number(boarding[1]):null,
            bearing:Number.isFinite(legBearing)?legBearing:null,
            minLat:lats.length?Math.min(...lats)-padLat:null,
            maxLat:lats.length?Math.max(...lats)+padLat:null,
            minLon:lons.length?Math.min(...lons)-padLon:null,
            maxLon:lons.length?Math.max(...lons)+padLon:null
          });
        }
        const color = walking ? "#e7eef7" : (modeInfo[product]?.c || "#4da8ff");
        const halo = L.polyline(coords, { pane: "plannerRouteHaloPane", color: "#071019", weight: walking ? 7 : 10, opacity: .84, lineCap: "round", lineJoin: "round", interactive: false, dashArray: walking ? "4 7" : null }).addTo(map);
        const line = L.polyline(coords, { pane: "plannerRoutePane", color, weight: walking ? 3 : 6, opacity: 1, lineCap: "round", lineJoin: "round", interactive: false, dashArray: walking ? "4 7" : null }).addTo(map);
        layers.push(halo, line);
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
        fitVehiclesOnce:true,
        routeBounds:bounds.isValid()?{south:bounds.getSouth(),west:bounds.getWest(),north:bounds.getNorth(),east:bounds.getEast()}:null
      };
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
      if (body) body.innerHTML = `<div class="detail-grid"><div class="detail-key">Dauer</div><div><b>${durationText(journey)}</b></div><div class="detail-key">Abfahrt</div><div>${fmtTime(dep)}</div><div class="detail-key">Ankunft</div><div>${fmtTime(arr)}</div><div class="detail-key">Umstiege</div><div>${transfers}</div></div><div class="route-chip"><span class="route-line-sample"></span><span>Route + Live-Fahrzeuge, die deinen Einstieg noch erreichen</span></div><div class="detail-section"><h3>Strecke</h3>${legRows}</div>`;
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
