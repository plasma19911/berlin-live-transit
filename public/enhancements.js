(() => {
  "use strict";
  const version = "20260813-live-journey-v2";
  const scripts = [
    "https://cdn.jsdelivr.net/gh/plasma19911/berlin-live-transit@ccebe02118fd0901e0f1c51a13284f654b5fe2bc/public/enhancements.js",
    "/journey-upgrade-core.js",
    "/journey-upgrade-ui.js",
    "/journey-upgrade-map.js"
  ];
  const load = src => new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src.startsWith("/") ? `${src}?v=${version}` : src;
    s.async = false;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Konnte ${src} nicht laden`));
    document.head.appendChild(s);
  });
  scripts.reduce((p, src) => p.then(() => load(src)), Promise.resolve()).catch(error => {
    console.error("Berlin Live Transit Erweiterungen:", error);
    const warn = document.getElementById("warn");
    if (warn) {
      warn.textContent = "Zusatzfunktionen konnten nicht geladen werden. Bitte Seite neu laden.";
      warn.classList.add("show");
    }
  });
})();