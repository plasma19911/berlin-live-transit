(() => {
  "use strict";

  function install() {
    const map = window.__berlinLiveMap;
    const state = window.__berlinLiveState;
    if (!map || !state || typeof map.fitBounds !== "function") {
      setTimeout(install, 80);
      return;
    }
    if (map.__vehicleClickNoZoomInstalled) return;
    map.__vehicleClickNoZoomInstalled = true;

    const originalFitBounds = map.fitBounds.bind(map);
    map.fitBounds = function(bounds, options) {
      // While /api/trip is being loaded for a clicked vehicle, index.html normally
      // fits the map to the complete line. Keep the user's current center + zoom instead.
      // Route planning/searching still use normal fitBounds because tripController is null there.
      if (state.selected && state.tripController) {
        return this;
      }
      return originalFitBounds(bounds, options);
    };
  }

  install();
})();
