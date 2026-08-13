from pathlib import Path
import re

idx_path=Path('public/index.html')
enh_path=Path('public/enhancements.js')
idx=idx_path.read_text(encoding='utf-8')
enh=enh_path.read_text(encoding='utf-8')

# Remove scheduled/planned placeholder CSS. Only real radar vehicles should be rendered.
enh=re.sub(r'\n    \.planned-vehicle-icon\{.*?\.planned-vehicle-card \.pv-count\{[^\n]*\}\n', '\n', enh, flags=re.S)

enh=enh.replace(
    'const routeState = { layers: [], controller: null, plannedVehicleLayer: null };',
    'const routeState = { layers: [], controller: null, eligibilitySeq: 0 };'
)

start=enh.find('  function liveVehicleMatchesLeg(vehicle, leg) {')
end_marker='  window.addEventListener("berlin-live-vehicles-updated", syncPlannedVehicleMarkers);'
end=enh.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('planned marker block not found')
end += len(end_marker)

new_block=r'''  function modeCompatible(a, b) {
    if (!a || !b || a === b) return true;
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
    if (!stops.length) return false;

    const boardIndexes = [];
    const alightIndexes = [];
    for (let i = 0; i < stops.length; i++) {
      if (stopMatches(stops[i], leg.boardId, leg.boardName, leg.boardLat, leg.boardLon)) boardIndexes.push(i);
      if (stopMatches(stops[i], leg.alightId, leg.alightName, leg.alightLat, leg.alightLon)) alightIndexes.push(i);
    }
    if (!boardIndexes.length || !alightIndexes.length) return false;

    const now = Date.now();
    for (const bi of boardIndexes) {
      const ai = alightIndexes.find(x => x > bi);
      if (ai == null) continue; // wrong direction: destination occurs before boarding stop
      const boardTime = stopTimeMs(stops[bi]);
      // A short grace period keeps a delayed vehicle visible around the boarding stop.
      if (!Number.isFinite(boardTime) || boardTime >= now - 2 * 60 * 1000) return true;
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

    window.__berlinRouteEligibility = { active: true, ready: false, ids: new Set() };
    if (map) map.fire("moveend");

    const eligible = new Set();
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
        continue;
      }

      // Without a trip id we cannot inspect the future stop sequence. Use a conservative
      // same-line + same-direction fallback rather than hiding a potentially useful live bus/train.
      if (!liveTripId) {
        if (matchingLegs.some(leg => directionLooksCompatible(vehicle, leg))) eligible.add(vehicleId);
        continue;
      }

      jobs.push({ vehicleId, liveTripId, matchingLegs });
    }

    // Limit concurrent trip lookups on mobile while still validating every candidate.
    let cursor = 0;
    const workers = Array.from({ length: Math.min(6, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        const trip = await fetchLiveTrip(job.liveTripId);
        if (seq !== routeState.eligibilitySeq) return;
        if (!trip) continue;
        if (job.matchingLegs.some(leg => tripStillReachesLeg(trip, leg))) eligible.add(job.vehicleId);
      }
    });
    await Promise.all(workers);
    if (seq !== routeState.eligibilitySeq) return;

    window.__berlinRouteEligibility = { active: true, ready: true, ids: eligible };
    if (filter.fitVehiclesOnce) filter.fitVehiclesOnce = true;
    if (map) map.fire("moveend");
  }

  let eligibilityTimer = null;
  window.addEventListener("berlin-live-vehicles-updated", () => {
    clearTimeout(eligibilityTimer);
    eligibilityTimer = setTimeout(refreshRouteLiveEligibility, 120);
  });'''

enh = enh[:start] + new_block + enh[end:]

# Clear route: remove old placeholder cleanup and reset eligibility.
enh = enh.replace(
'''    if (map && routeState.plannedVehicleLayer && map.hasLayer(routeState.plannedVehicleLayer)) map.removeLayer(routeState.plannedVehicleLayer);
    routeState.plannedVehicleLayer = null;
    routeState.layers = [];
    window.__berlinPlannedVehicleFilter={active:false,legs:[]};''',
'''    routeState.eligibilitySeq++;
    routeState.layers = [];
    window.__berlinPlannedVehicleFilter={active:false,legs:[]};
    window.__berlinRouteEligibility={active:false,ready:true,ids:new Set()};'''
)

# Store exact boarding AND alighting stop identity/location for direction-safe validation.
old='''        const boarding=legPoint(leg?.origin);
        const tripId=String(leg?.tripId||leg?.trip?.id||"");
        const line=String(leg?.line?.name||leg?.line?.id||"");
        const lineId=String(leg?.line?.id||"");
        const departure=String(leg?.departure||leg?.plannedDeparture||"");
        const boardName=String(leg?.origin?.name||leg?.origin?.address||"");'''
new='''        const boarding=legPoint(leg?.origin);
        const alighting=legPoint(leg?.destination);
        const tripId=String(leg?.tripId||leg?.trip?.id||"");
        const line=String(leg?.line?.name||leg?.line?.id||"");
        const lineId=String(leg?.line?.id||"");
        const departure=String(leg?.departure||leg?.plannedDeparture||"");
        const boardId=String(leg?.origin?.id||leg?.origin?.stop?.id||"");
        const boardName=String(leg?.origin?.name||leg?.origin?.address||"");
        const alightId=String(leg?.destination?.id||leg?.destination?.stop?.id||"");
        const alightName=String(leg?.destination?.name||leg?.destination?.address||"");'''
if old not in enh:
    raise SystemExit('register leg boarding block not found')
enh=enh.replace(old,new,1)

enh=enh.replace(
'''          tripId,departure,boardName,
          boardLat:boarding?Number(boarding[0]):null,
          boardLon:boarding?Number(boarding[1]):null,''',
'''          tripId,departure,boardId,boardName,alightId,alightName,
          boardLat:boarding?Number(boarding[0]):null,
          boardLon:boarding?Number(boarding[1]):null,
          alightLat:alighting?Number(alighting[0]):null,
          alightLon:alighting?Number(alighting[1]):null,''',1)

# Start validation immediately after route filter is installed.
needle='''      window.__berlinPlannedVehicleFilter={
        active:true,
        legs:relevantVehicleLegs,
        journeyCount:hourJourneys.length,
        windowMinutes:Number(data?.routeWindowMinutes)||60,
        fitVehiclesOnce:true,
        routeBounds:bounds.isValid()?{south:bounds.getSouth(),west:bounds.getWest(),north:bounds.getNorth(),east:bounds.getEast()}:null
      };'''
if needle not in enh:
    raise SystemExit('planned vehicle filter assignment not found')
enh=enh.replace(needle, needle + '''
      window.__berlinRouteEligibility={active:true,ready:false,ids:new Set()};
      refreshRouteLiveEligibility();''', 1)

# Make UI wording explicit: only actual radar vehicles are shown.
enh=enh.replace(
'Alle passenden Live-Fahrzeuge bis zum Ziel · Start innerhalb der nächsten 60 Min',
'Echte Live-Fahrzeuge, die deinen Einstieg noch erreichen · bis zum Ziel'
)

# Index: when trip validation is ready, use its exact eligible vehicle IDs.
old_idx='''  if(plannedFilterActive){
    const base=[...state.vehicles.entries()].filter(([,d])=>state.enabled.has(d.mode));
    let matches=base.filter(([,d])=>plannedRouteVehicleMatch(d));
    if(!matches.length){
      matches=base.filter(([,d])=>plannedRouteVehicleMatch(d,{relaxed:true}));
    }
    plannedIds=new Set(matches.map(([id])=>id));'''
new_idx='''  if(plannedFilterActive){
    const base=[...state.vehicles.entries()].filter(([,d])=>state.enabled.has(d.mode));
    const eligibility=window.__berlinRouteEligibility;
    let matches;
    if(eligibility?.active && eligibility.ready && eligibility.ids instanceof Set){
      matches=base.filter(([id])=>eligibility.ids.has(id));
    }else if(eligibility?.active){
      // While full stop-sequence validation is running, only show exact planned trips.
      matches=base.filter(([,d])=>{
        const trip=String(d.raw?.tripId||d.raw?.journeyId||d.raw?.trip?.id||"");
        return trip && routeFilter.legs.some(leg=>leg.tripId&&String(leg.tripId)===trip);
      });
    }else{
      matches=base.filter(([,d])=>plannedRouteVehicleMatch(d));
      if(!matches.length)matches=base.filter(([,d])=>plannedRouteVehicleMatch(d,{relaxed:true}));
    }
    plannedIds=new Set(matches.map(([id])=>id));'''
if old_idx not in idx:
    raise SystemExit('render planned filter block not found')
idx=idx.replace(old_idx,new_idx,1)

# Assertions: no planned placeholder generator remains, validation data exists.
if 'GEPLANT ·' in enh or 'syncPlannedVehicleMarkers' in enh:
    raise SystemExit('scheduled placeholder code still present')
for token in ['tripStillReachesLeg','refreshRouteLiveEligibility','alightId','window.__berlinRouteEligibility']:
    if token not in enh:
        raise SystemExit(f'missing enhancement token {token}')
if 'eligibility.ids instanceof Set' not in idx:
    raise SystemExit('index eligibility integration missing')

enh_path.write_text(enh,encoding='utf-8')
idx_path.write_text(idx,encoding='utf-8')
