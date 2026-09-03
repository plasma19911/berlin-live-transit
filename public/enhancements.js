(() => {
  "use strict";
  const version = "20260903-live-accuracy-v4";
  const ACCURACY_REFRESH_MS = 15000;
  const scripts = [
    "https://cdn.jsdelivr.net/gh/plasma19911/berlin-live-transit@ccebe02118fd0901e0f1c51a13284f654b5fe2bc/public/enhancements.js",
    "/journey-upgrade-core.js",
    "/journey-upgrade-ui.js",
    "/journey-upgrade-map.js",
    "/vehicle-click-nozoom.js"
  ];
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
    note.textContent = `Positionsgenauigkeit: berechnete VBB-Prognose, kein GPS${freshness}. Das Symbol kann deshalb zwischen Haltestellen von der tatsächlichen Busposition abweichen.`;
  };

  scripts.reduce((p, src) => p.then(() => load(src)), Promise.resolve()).catch(error => {
    console.error("Berlin Live Transit Erweiterungen:", error);
    const warn = document.getElementById("warn");
    if (warn) {
      warn.textContent = "Zusatzfunktionen konnten nicht geladen werden. Bitte Seite neu laden.";
      warn.classList.add("show");
    }
  });

  window.addEventListener("load", () => {
    setTimeout(triggerFreshRadar, 4000);
    setInterval(triggerFreshRadar, ACCURACY_REFRESH_MS);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) setTimeout(triggerFreshRadar, 250);
  });
  window.addEventListener("berlin-live-vehicles-updated", updateAccuracyNote);
  document.addEventListener("click", event => {
    if (event.target?.closest?.(".leaflet-marker-icon,.leaflet-interactive")) {
      setTimeout(updateAccuracyNote, 800);
    }
  }, true);
})();