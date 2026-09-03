(() => {
  "use strict";

  const version = "20260903-zoom-direction-v10";
  const ACCURACY_REFRESH_MS = 15000;
  const MIN_ACTIVE_ZOOM = 12;
  const RICH_PATH_ZOOM = 14;
  const VIEW_PADDING = 0.10;
  const VIEWPORT_TIMEOUT_MS = 4500;
  const STALE_STOP_GRACE_MS = 4000;

  const DWELL_FALLBACK_MS = {
    bus: 18000,
    replacement: 20000,
    tram: 20000,
    subway: 25000,
    suburban: 30000,
    regional: 40000,
    express: 55000,
    ferry: 45000
  };

  const MAX_SPEED_MPS = {
    bus: 16,
    replacement: 14,
    tram: 17,
    subway: 24,
    suburban: 30,
    regional: 38,
    express: 45,
    ferry: 11
  };

  const CORRECTION_SPEED_MPS = {
    bus: 8,
    replacement: 7,
    tram: 9,
    subway: 14,
    suburban: 16,
    regional: 20,
    express: 25,
    ferry: 6
  };

  const STOP_HOLD_RADIUS_M = {
    bus: 12,
    replacement: 12,
    tram: 10,
    subway: 14,
    suburban: 16,
    regional: 18,
    express: 20,
    ferry: 18
  };

  const scripts = [
    "https://cdn.jsdelivr.net/gh/plasma19911/berlin-live-transit@ccebe02118fd0901e0f1c51a13284f654b5fe2bc/public/enhancements.js",
    "/journey-upgrade-core.js",
    "/journey-upgrade-ui.js",
    "/journey-upgrade-map.js",
    "/vehicle-click-nozoom.js"
  ];

  const motions = new Map();
  const visualPositions = new Map();
  let viewRefreshTimer = null;

  const load = src => new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src.startsWith("/") ? `${src}?v=${version}` : src;
    s.async = false;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Konnte ${src} nicht laden`));
    document.head.appendChild(s);
  });

  const currentZoom = () => Number(window.__berlinLiveMap?.getZoom?.() ?? 0);

  // index.html also has a legacy 30-second full refresh. Keep it only when the user has
  // zoomed close enough for live tracking to be useful. The first page load still gets one
  // overview snapshot, but the overview no longer hammers the radar every 30 seconds.
  if (!window.__berlinZoomIntervalGuardInstalled) {
    window.__berlinZoomIntervalGuardInstalled = true;
    const nativeSetInterval = window.setInterval.bind(window);
    window.setInterval = (handler, timeout, ...args) => {
      if (Number(timeout) === 30000 && typeof handler === "function" && handler.name === "refresh") {
        return nativeSetInterval(() => {
          if (currentZoom() >= MIN_ACTIVE_ZOOM && !document.hidden) handler(...args);
        }, timeout);
      }
      return nativeSetInterval(handler, timeout, ...args);
    };
  }

  const triggerFreshRadar = () => {
    const state = window.__berlinLiveState;
    const refresh = document.getElementById("refresh");
    if (!refresh || document.hidden || state?.busy) return;
    if (currentZoom() < MIN_ACTIVE_ZOOM) return;
    refresh.click();
  };

  const scheduleViewRefresh = (delay = 320) => {
    clearTimeout(viewRefreshTimer);
    if (currentZoom() < MIN_ACTIVE_ZOOM) return;
    viewRefreshTimer = setTimeout(triggerFreshRadar, delay);
  };

  if (window.L?.map && !window.__berlinLiveMapCaptureInstalled) {
    window.__berlinLiveMapCaptureInstalled = true;
    const originalMapFactory = window.L.map;
    window.L.map = function(...args) {
      const map = originalMapFactory.apply(this, args);
      window.__berlinLiveMap = map;
      setTimeout(() => {
        map.on("moveend", () => scheduleViewRefresh());
        map.on("zoomend", () => {
          if (Number(map.getZoom()) < MIN_ACTIVE_ZOOM) {
            clearTimeout(viewRefreshTimer);
            for (const id of [...motions.keys()]) cancelMotion(id);
            visualPositions.clear();
            return;
          }
          scheduleViewRefresh(220);
        });
      }, 0);
      return map;
    };
  }

  // At live-tracking zoom levels every normal radar request is replaced by one request for
  // the visible viewport. Wide overview zooms remain a lightweight snapshot only.
  if (!window.__berlinViewportRadarInstalled) {
    window.__berlinViewportRadarInstalled = true;
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      let originalUrl = null;
      try {
        const rawUrl = typeof input === "string" ? input : input?.url;
        if (!rawUrl) return nativeFetch(input, init);
        originalUrl = new URL(rawUrl, window.location.href);
        const map = window.__berlinLiveMap;
        const zoom = Number(map?.getZoom?.() ?? 0);

        if (
          zoom >= MIN_ACTIVE_ZOOM &&
          originalUrl.origin === window.location.origin &&
          originalUrl.pathname === "/api/radar-berlin" &&
          map?.getBounds
        ) {
          const b = map.getBounds().pad(VIEW_PADDING);
          const north = Math.min(52.80, b.getNorth());
          const west = Math.max(12.90, b.getWest());
          const south = Math.max(52.25, b.getSouth());
          const east = Math.min(14.00, b.getEast());

          if (north > south && east > west) {
            const wantRichPath = zoom >= RICH_PATH_ZOOM;
            const viewportUrl = new URL("/api/radar", window.location.origin);
            viewportUrl.search = new URLSearchParams({
              north: String(north),
              west: String(west),
              south: String(south),
              east: String(east),
              results: "256",
              duration: "20",
              frames: wantRichPath ? "4" : "2",
              polylines: wantRichPath ? "true" : "false",
              language: "de",
              pretty: "false"
            }).toString();

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), VIEWPORT_TIMEOUT_MS);
            try {
              const response = await nativeFetch(viewportUrl.toString(), {
                ...(init || {}),
                signal: controller.signal
              });
              if (response.ok) return response;
              console.warn("Kartenausschnitt-Radar HTTP", response.status, "– nutze Berlin-Fallback");
            } catch (error) {
              console.warn("Kartenausschnitt-Radar nicht verfügbar – nutze Berlin-Fallback", error);
            } finally {
              clearTimeout(timer);
            }

            return nativeFetch(input, init);
          }
        }
      } catch (error) {
        console.warn("Kartenausschnitt-Radar:", error, originalUrl?.toString?.() || "");
      }
      return nativeFetch(input, init);
    };
  }

  const timeMs = value => {
    const n = new Date(value || 0).getTime();
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const pointOf = value => {
    const p = value?.location || value?.stop?.location || value;
    const lat = Number(p?.latitude ?? p?.lat);
    const lng = Number(p?.longitude ?? p?.lon ?? p?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  };

  const haversine = (a, b) => {
    if (!a || !b) return Infinity;
    const R = 6371000;
    const p1 = a.lat * Math.PI / 180;
    const p2 = b.lat * Math.PI / 180;
    const dp = (b.lat - a.lat) * Math.PI / 180;
    const dl = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  const bearingBetween = (a, b) => {
    if (!a || !b || haversine(a, b) < 1.2) return null;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const dLon = (b.lng - a.lng) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    return Number.isFinite(deg) ? deg : null;
  };

  const setMarkerBearing = (marker, bearing, motion = null) => {
    if (!Number.isFinite(Number(bearing))) return;
    const root = marker?.getElement?.();
    if (!root) return;
    const arrow = root.querySelector?.(".veh-arrow");
    if (!arrow) return;

    let target = Number(bearing);
    if (motion && Number.isFinite(motion.displayBearing)) {
      const normalizedPrevious = ((motion.displayBearing % 360) + 360) % 360;
      const delta = ((target - normalizedPrevious + 540) % 360) - 180;
      target = motion.displayBearing + delta;
    }
    if (motion) motion.displayBearing = target;

    arrow.style.setProperty("--bearing", `${target.toFixed(1)}deg`);
    root.querySelector?.(".veh-wrap")?.classList.remove("no-bearing");
  };

  const profileFor = vehicle => ({
    max: MAX_SPEED_MPS[vehicle?.mode] || 16,
    correction: CORRECTION_SPEED_MPS[vehicle?.mode] || 8,
    holdRadius: STOP_HOLD_RADIUS_M[vehicle?.mode] || 12
  });

  const rememberPosition = (id, marker, point = null) => {
    const p = point || marker?.getLatLng?.();
    const lat = Number(p?.lat), lng = Number(p?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) visualPositions.set(id, { lat, lng });
  };

  const geometryPaths = geometry => {
    if (!geometry) return [];
    if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
      return [geometry.coordinates.map(c => ({ lat: Number(c[1]), lng: Number(c[0]) }))
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))];
    }
    if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
      return geometry.coordinates
        .map(line => line.map(c => ({ lat: Number(c[1]), lng: Number(c[0]) }))
          .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)))
        .filter(line => line.length > 1);
    }
    return [];
  };

  const polylinePaths = polyline => {
    if (!polyline) return [];
    if (polyline.type === "FeatureCollection") {
      return (polyline.features || []).flatMap(f => geometryPaths(f?.geometry));
    }
    if (polyline.type === "Feature") return geometryPaths(polyline.geometry);
    return geometryPaths(polyline);
  };

  const nearestIndex = (path, point) => {
    let best = -1, bestDistance = Infinity;
    for (let i = 0; i < path.length; i++) {
      const d = haversine(path[i], point);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    return { index: best, distance: bestDistance };
  };

  const routePath = (raw, from, to) => {
    const paths = polylinePaths(raw?.polyline);
    let best = null;
    for (const path of paths) {
      if (path.length < 2) continue;
      const a = nearestIndex(path, from);
      const b = nearestIndex(path, to);
      if (a.index < 0 || b.index < 0) continue;
      const score = a.distance + b.distance;
      if (!best || score < best.score) best = { path, a, b, score };
    }
    if (!best || best.a.distance > 700 || best.b.distance > 700) return [from, to];

    const section = best.a.index <= best.b.index
      ? best.path.slice(best.a.index, best.b.index + 1)
      : best.path.slice(best.b.index, best.a.index + 1).reverse();
    const out = [from, ...section, to];
    return out.filter((p, i) => i === 0 || haversine(out[i - 1], p) > 0.8);
  };

  const pathMetrics = path => {
    const lengths = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const length = haversine(path[i - 1], path[i]);
      lengths.push(length);
      total += length;
    }
    return { lengths, total };
  };

  const pointAlong = (path, metrics, fraction) => {
    if (!path.length) return null;
    if (path.length === 1 || metrics.total <= 0) return path[0];
    const target = Math.max(0, Math.min(1, fraction)) * metrics.total;
    let passed = 0;
    for (let i = 0; i < metrics.lengths.length; i++) {
      const length = metrics.lengths[i];
      if (passed + length >= target || i === metrics.lengths.length - 1) {
        const local = length > 0 ? (target - passed) / length : 0;
        const a = path[i], b = path[i + 1];
        return {
          lat: a.lat + (b.lat - a.lat) * local,
          lng: a.lng + (b.lng - a.lng) * local
        };
      }
      passed += length;
    }
    return path[path.length - 1];
  };

  const nextStopInfo = vehicle => {
    const raw = vehicle?.raw || {};
    const now = Date.now();
    const stops = Array.isArray(raw.nextStopovers) ? raw.nextStopovers : [];
    for (const stopover of stops) {
      const point = pointOf(stopover?.stop || stopover);
      if (!point) continue;
      let arrival = timeMs(stopover?.arrival || stopover?.plannedArrival);
      let departure = timeMs(stopover?.departure || stopover?.plannedDeparture);
      const fallbackDwell = DWELL_FALLBACK_MS[vehicle.mode] || 22000;
      if (!arrival && departure) arrival = departure - fallbackDwell;
      if (arrival && !departure) departure = arrival + fallbackDwell;
      if (!arrival && !departure) continue;
      if ((departure || arrival) >= now - STALE_STOP_GRACE_MS) {
        return { point, arrival, departure, fallbackDwell };
      }
    }
    return null;
  };

  const cancelMotion = id => {
    const current = motions.get(id);
    if (current) current.cancelled = true;
    motions.delete(id);
  };

  const holdAtStop = (id, marker, point, departure, motion) => {
    marker.setLatLng([point.lat, point.lng]);
    rememberPosition(id, marker, point);
    const hold = () => {
      if (motion.cancelled || !window.__berlinLiveState?.markers?.has(id)) return;
      if (Date.now() < departure) {
        marker.setLatLng([point.lat, point.lng]);
        rememberPosition(id, marker, point);
        requestAnimationFrame(hold);
      } else {
        motions.delete(id);
      }
    };
    requestAnimationFrame(hold);
  };

  const animatePath = (id, marker, path, duration, motion, done) => {
    const metrics = pathMetrics(path);
    if (metrics.total <= 0) {
      motions.delete(id);
      return;
    }
    motion.speedMps = metrics.total / Math.max(0.001, duration / 1000);
    const started = performance.now();

    const initialAhead = pointAlong(path, metrics, Math.min(1, Math.max(0.002, 10 / metrics.total)));
    const initialBearing = bearingBetween(path[0], initialAhead);
    if (initialBearing !== null) setMarkerBearing(marker, initialBearing, motion);

    const step = frameNow => {
      if (motion.cancelled || !window.__berlinLiveState?.markers?.has(id)) return;
      const p = Math.max(0, Math.min(1, (frameNow - started) / duration));
      const pos = pointAlong(path, metrics, p);
      if (pos) {
        marker.setLatLng([pos.lat, pos.lng]);
        rememberPosition(id, marker, pos);

        // Direction is derived from the path the marker is actually travelling on, not from
        // a possibly stale/wrong API bearing. Look roughly 10 m ahead to avoid jitter.
        const lookAhead = Math.min(1, p + Math.max(0.002, Math.min(0.04, 10 / metrics.total)));
        if (lookAhead > p) {
          const ahead = pointAlong(path, metrics, lookAhead);
          const liveBearing = bearingBetween(pos, ahead);
          if (liveBearing !== null) setMarkerBearing(marker, liveBearing, motion);
        }
      }
      if (p < 1) requestAnimationFrame(step);
      else if (done) done();
      else motions.delete(id);
    };
    requestAnimationFrame(step);
  };

  const startVehicleMotion = (id, rendered, vehicle) => {
    const marker = rendered?.marker;
    if (!marker?.getLatLng || !marker?.setLatLng) return;

    const currentMarker = marker.getLatLng();
    const remembered = visualPositions.get(id);
    const from = remembered || { lat: Number(currentMarker.lat), lng: Number(currentMarker.lng) };
    const radarPoint = { lat: Number(vehicle.lat), lng: Number(vehicle.lon) };
    if (![from.lat, from.lng, radarPoint.lat, radarPoint.lng].every(Number.isFinite)) return;

    marker.setLatLng([from.lat, from.lng]);
    rememberPosition(id, marker, from);

    const profile = profileFor(vehicle);
    const stop = nextStopInfo(vehicle);
    cancelMotion(id);
    const motion = { cancelled: false, speedMps: 0, displayBearing: null };
    motions.set(id, motion);

    if (!stop) {
      const path = routePath(vehicle.raw, from, radarPoint);
      const metrics = pathMetrics(path);
      if (metrics.total < 1) {
        if (Number.isFinite(Number(vehicle.bearing))) setMarkerBearing(marker, Number(vehicle.bearing), motion);
        motions.delete(id);
        return;
      }
      const duration = Math.max(
        2500,
        metrics.total / profile.max * 1000,
        metrics.total / profile.correction * 1000
      );
      animatePath(id, marker, path, duration, motion);
      return;
    }

    const now = Date.now();
    const arrival = stop.arrival || now + ACCURACY_REFRESH_MS;
    const departure = stop.departure || arrival + stop.fallbackDwell;
    const distanceToStop = haversine(from, stop.point);

    if (arrival <= now && now < departure && distanceToStop <= profile.holdRadius) {
      const stopBearing = bearingBetween(radarPoint, stop.point);
      if (stopBearing !== null) setMarkerBearing(marker, stopBearing, motion);
      holdAtStop(id, marker, stop.point, departure, motion);
      return;
    }

    const distanceToRadar = haversine(from, radarPoint);
    const startPoint = distanceToRadar > 1200 ? radarPoint : from;
    const path = routePath(vehicle.raw, startPoint, stop.point);
    const correctionPath = haversine(from, startPoint) > 3 ? [from, ...path] : path;
    const metrics = pathMetrics(correctionPath);
    if (metrics.total <= 0) {
      const toStop = bearingBetween(from, stop.point);
      if (toStop !== null) setMarkerBearing(marker, toStop, motion);
      motions.delete(id);
      return;
    }

    const scheduledRemaining = Math.max(0, arrival - now);
    const physicalMinimum = metrics.total / profile.max * 1000;
    const correctionDuration = metrics.total / profile.correction * 1000;
    const remaining = arrival > now
      ? Math.max(1500, scheduledRemaining, physicalMinimum)
      : Math.max(2500, correctionDuration, physicalMinimum);

    animatePath(id, marker, correctionPath, remaining, motion, () => {
      if (Date.now() < departure) holdAtStop(id, marker, stop.point, departure, motion);
      else motions.delete(id);
    });
  };

  const updateVehicleMotions = () => {
    const state = window.__berlinLiveState;
    if (!state?.markers || !state?.vehicles) return;

    // At overview zooms do not animate. Still correct the direction arrow from the next stop,
    // which is usually more reliable than the raw bearing field.
    if (currentZoom() < MIN_ACTIVE_ZOOM) {
      for (const id of [...motions.keys()]) cancelMotion(id);
      visualPositions.clear();
      for (const [id, rendered] of state.markers.entries()) {
        const vehicle = state.vehicles.get(id);
        if (!vehicle) continue;
        const stop = nextStopInfo(vehicle);
        const from = { lat: Number(vehicle.lat), lng: Number(vehicle.lon) };
        const staticBearing = stop ? bearingBetween(from, stop.point) : null;
        if (staticBearing !== null) setMarkerBearing(rendered.marker, staticBearing);
        else if (Number.isFinite(Number(vehicle.bearing))) setMarkerBearing(rendered.marker, Number(vehicle.bearing));
      }
      return;
    }

    for (const [id, rendered] of state.markers.entries()) {
      const vehicle = state.vehicles.get(id);
      if (vehicle) startVehicleMotion(id, rendered, vehicle);
    }
    for (const id of [...motions.keys()]) {
      if (!state.markers.has(id) || !state.vehicles.has(id)) cancelMotion(id);
    }
    for (const id of [...visualPositions.keys()]) {
      if (!state.vehicles.has(id)) visualPositions.delete(id);
    }
  };

  const updateAccuracyNote = () => {
    const state = window.__berlinLiveState;
    const body = document.getElementById("detailBody");
    if (!body || !state?.selected) return;
    const vehicle = state.vehicles?.get?.(state.selected);
    if (!vehicle) return;

    let note = body.querySelector("[data-live-accuracy-note]");
    if (!note) {
      note = document.createElement("div");
      note.className = "note";
      note.dataset.liveAccuracyNote = "true";
      note.style.marginTop = "10px";
      body.appendChild(note);
    }

    const age = Number(vehicle.raw?.predictionAgeSeconds);
    const freshness = Number.isFinite(age)
      ? ` · Prognosedaten ca. ${Math.max(0, Math.round(age))} s alt`
      : "";
    const activeMotion = motions.get(state.selected);
    const speedText = Number.isFinite(activeMotion?.speedMps)
      ? ` · Animation ca. ${Math.round(activeMotion.speedMps * 3.6)} km/h`
      : "";
    note.textContent = `Positionsgenauigkeit: VBB-Prognose, kein GPS${freshness}${speedText}. Live-Aktualisierung und Bewegung starten ab Zoom ${MIN_ACTIVE_ZOOM}. Der Richtungspfeil folgt der tatsächlich dargestellten Fahrstrecke.`;
  };

  scripts.reduce((p, src) => p.then(() => load(src)), Promise.resolve()).catch(error => {
    console.error("Berlin Live Transit Zusatzfunktionen:", error);
  });

  window.addEventListener("load", () => {
    setTimeout(triggerFreshRadar, 2200);
    window.setInterval(triggerFreshRadar, ACCURACY_REFRESH_MS);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && currentZoom() >= MIN_ACTIVE_ZOOM) setTimeout(triggerFreshRadar, 200);
  });

  window.addEventListener("berlin-live-vehicles-updated", () => {
    requestAnimationFrame(updateVehicleMotions);
    updateAccuracyNote();
  });

  document.addEventListener("click", event => {
    if (event.target?.closest?.(".leaflet-marker-icon,.leaflet-interactive")) {
      setTimeout(updateAccuracyNote, 500);
    }
  }, true);
})();
