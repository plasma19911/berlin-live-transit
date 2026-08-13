from pathlib import Path

index_path=Path('public/index.html')
enh_path=Path('public/enhancements.js')
index=index_path.read_text(encoding='utf-8')
enh=enh_path.read_text(encoding='utf-8')

# Expose only the in-browser live vehicle state for the planner extension.
needle='const state={vehicles:new Map(),markers:new Map(),enabled:new Set(Object.keys(modes)),query:"",busy:false,counts:{},selected:null,tripLayers:new Map(),renderMode:null,tripController:null,selectionSeq:0,focusSelected:false};\n'
replacement=needle+'window.__berlinLiveState=state;\n'
if 'window.__berlinLiveState=state;' not in index:
    if needle not in index: raise SystemExit('state needle missing')
    index=index.replace(needle,replacement,1)

# Notify enhancements whenever the live radar set has refreshed.
needle2='    renderVehicles();\n\n    if(usable>0){\n'
replacement2='    renderVehicles();\n    window.dispatchEvent(new CustomEvent("berlin-live-vehicles-updated"));\n\n    if(usable>0){\n'
if 'berlin-live-vehicles-updated' not in index:
    if needle2 not in index: raise SystemExit('refresh needle missing')
    index=index.replace(needle2,replacement2,1)

# CSS for clearly non-live scheduled markers.
css_needle='    body.planned-route-focus .veh{box-shadow:0 0 0 2px rgba(255,255,255,.98),0 0 0 5px rgba(5,10,16,.88),0 0 18px rgba(77,168,255,.75)!important}\n'
css_extra=css_needle+'''    .planned-vehicle-icon{background:transparent!important;border:0!important;overflow:visible!important}\n    .planned-vehicle-card{min-width:72px;padding:5px 7px;border-radius:10px;background:rgba(11,18,27,.94);border:2px dashed rgba(255,255,255,.9);box-shadow:0 3px 12px rgba(0,0,0,.55);color:#fff;text-align:center;font-family:Inter,system-ui,sans-serif;line-height:1.05}\n    .planned-vehicle-card .pv-mode{display:block;font-size:7px;font-weight:1000;letter-spacing:.08em;color:var(--pv-color,#4da8ff)}\n    .planned-vehicle-card .pv-line{display:block;font-size:12px;font-weight:1000;margin-top:2px}\n    .planned-vehicle-card .pv-time{display:block;font-size:8px;font-weight:800;color:#d9e5f2;margin-top:3px}\n    .planned-vehicle-card .pv-count{display:inline-block;margin-left:3px;padding:1px 4px;border-radius:8px;background:rgba(77,168,255,.22);font-size:8px}\n'''
if '.planned-vehicle-card{' not in enh:
    if css_needle not in enh: raise SystemExit('css needle missing')
    enh=enh.replace(css_needle,css_extra,1)

# Planner pane must sit below real live vehicles (700) but above route lines (660).
pane_old='''      ["plannerRouteHaloPane", "650"],\n      ["plannerRoutePane", "660"],\n      ["plannerStopPane", "820"]\n'''
pane_new='''      ["plannerRouteHaloPane", "650"],\n      ["plannerRoutePane", "660"],\n      ["plannerVehiclePane", "690"],\n      ["plannerStopPane", "820"]\n'''
if '["plannerVehiclePane", "690"]' not in enh:
    if pane_old not in enh: raise SystemExit('pane needle missing')
    enh=enh.replace(pane_old,pane_new,1)

# Track the scheduled placeholder layer.
state_old='  const routeState = { layers: [], controller: null };\n'
state_new='  const routeState = { layers: [], controller: null, plannedVehicleLayer: null };\n'
if 'plannedVehicleLayer' not in enh:
    if state_old not in enh: raise SystemExit('routeState needle missing')
    enh=enh.replace(state_old,state_new,1)

# Insert scheduled/live synchronization helpers before clearPlannedRoute.
helper_anchor='  function clearPlannedRoute() {\n'
helpers=r'''  function normRouteValue(value) {
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

'''
if 'function syncPlannedVehicleMarkers()' not in enh:
    if helper_anchor not in enh: raise SystemExit('clearPlannedRoute anchor missing')
    enh=enh.replace(helper_anchor,helpers+helper_anchor,1)

# Clear planned marker layer with route.
clear_needle='''    const map = window.__berlinLiveMap;\n    if (map) for (const layer of routeState.layers) if (layer && map.hasLayer(layer)) map.removeLayer(layer);\n    routeState.layers = [];\n'''
clear_repl='''    const map = window.__berlinLiveMap;\n    if (map) for (const layer of routeState.layers) if (layer && map.hasLayer(layer)) map.removeLayer(layer);\n    if (map && routeState.plannedVehicleLayer && map.hasLayer(routeState.plannedVehicleLayer)) map.removeLayer(routeState.plannedVehicleLayer);\n    routeState.plannedVehicleLayer = null;\n    routeState.layers = [];\n'''
if 'routeState.plannedVehicleLayer = null;\n    routeState.layers = [];' not in enh:
    if clear_needle not in enh: raise SystemExit('clear layer needle missing')
    enh=enh.replace(clear_needle,clear_repl,1)

# Sync placeholders immediately after the planned filter is populated.
filter_anchor='''        routeBounds:bounds.isValid()?{south:bounds.getSouth(),west:bounds.getWest(),north:bounds.getNorth(),east:bounds.getEast()}:null\n      };\n'''
filter_repl=filter_anchor+'      syncPlannedVehicleMarkers();\n'
if '      syncPlannedVehicleMarkers();\n      if (bounds.isValid())' not in enh:
    if filter_anchor not in enh: raise SystemExit('filter anchor missing')
    enh=enh.replace(filter_anchor,filter_repl,1)

index_path.write_text(index,encoding='utf-8')
enh_path.write_text(enh,encoding='utf-8')

Path('.github/planned_vehicle_placeholders_patch.py').unlink(missing_ok=True)
Path('.github/workflows/planned-vehicle-placeholders.yml').unlink(missing_ok=True)
