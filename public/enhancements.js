(() => {
  "use strict";

  const version = "20260903-radar-stable-v9";
  const ACCURACY_REFRESH_MS = 15000;
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

  // These are the existing UI/journey additions. Keep them separate from the radar logic,
  // so a failed optional UI script can never disable the base live map.
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

  const triggerFreshRadar = () => {
    const state = window.__berlinLiveState;
    const refresh = document.getElementById("refresh");
    if (!refresh || document.hidden || state?.busy) return;
    refresh.click();
  };

  const scheduleViewRefresh = (delay = 260) => {
    clearTimeout(viewRefreshTimer);
    viewRefreshTimer = setTimeout(triggerFreshRadar, delay);
  };

  // Capture the Leaflet map because enhancements.js is loaded before index.html creates it.
  if (window.L?.map && !window.__berlinLiveMapCaptureInstalled) {
    window.__berlinLiveMapCaptureInstalled = true;
    const originalMapFactory = window.L.map;
    window.L.map = function(...args) {
      const map = originalMapFactory.apply(this, args);
      window.__berlinLiveMap = map;
      setTimeout(() => {
        map.on("moveend", () => scheduleViewRefresh());
        map.on("zoomend", () => scheduleViewRefresh());
      }, 0);
      return map;
    };
  }

  // Use only the visible viewport for the normal radar refresh. Most importantly this is
  // fail-safe: if the viewport endpoint is slow or fails, immediately use the proven full
  // Berlin endpoint. Optional motion detail must never be able to blank the map.
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

        if (
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
            const zoom = Number(map.getZoom?.() ?? 11);
            const wantRichPath = zoom >= 14;
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
    const step = frameNow => {
      if (motion.cancelled || !window.__berlinLiveState?.markers?.has(id)) return;
      const p = Math.max(0, Math.min(1, (frameNow - started) / duration));
      const pos = pointAlong(path, metrics, p);
      if (pos) {
        marker.setLatLng([pos.lat, pos.lng]);
        rememberPosition(id, marker, pos);
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
    const motion = { cancelled: false, speedMps: 0 };
    motions.set(id, motion);

    if (!stop) {
      const path = routePath(vehicle.raw, from, radarPoint);
      const metrics = pathMetrics(path);
      if (metrics.total < 1) {
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
      holdAtStop(id, marker, stop.point, departure, motion);
      return;
    }

    // A wildly different new radar point is used only as an anchor for the new prediction;
    // otherwise continue exactly from the last visibly rendered position to avoid teleporting.
    const distanceToRadar = haversine(from, radarPoint);
    const startPoint = distanceToRadar > 1200 ? radarPoint : from;
    const path = routePath(vehicle.raw, startPoint, stop.point);
    const correctionPath = haversine(from, startPoint) > 3 ? [from, ...path] : path;
    const metrics = pathMetrics(correctionPath);
    if (metrics.total <= 0) {
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
    note.textContent = `Positionsgenauigkeit: VBB-Prognose, kein GPS${freshness}${speedText}. Die Karte nutzt bevorzugt den sichtbaren Ausschnitt und fällt bei Radarproblemen automatisch auf den stabilen Berlin-Radar zurück.`;
  };

  // Optional UI additions are deliberately non-fatal.
  scripts.reduce((p, src) => p.then(() => load(src)), Promise.resolve()).catch(error => {
    console.error("Berlin Live Transit Zusatzfunktionen:", error);
  });

  window.addEventListener("load", () => {
    setTimeout(triggerFreshRadar, 2200);
    setInterval(triggerFreshRadar, ACCURACY_REFRESH_MS);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) setTimeout(triggerFreshRadar, 200);
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
