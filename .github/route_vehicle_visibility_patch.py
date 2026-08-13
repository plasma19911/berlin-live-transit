from pathlib import Path

index_path = Path('public/index.html')
enh_path = Path('public/enhancements.js')
index = index_path.read_text(encoding='utf-8')
enh = enh_path.read_text(encoding='utf-8')

old_render = '''function renderVehicles(){
  const zoom=map.getZoom();
  const mode=zoom<=11?"dots":"icons";
  const bounds=map.getBounds().pad(zoom<=11?0.03:0.12);
  const wanted=new Set();
  let visible=0;

  const plannedFilterActive=Boolean(window.__berlinPlannedVehicleFilter?.active);'''
new_render = '''function renderVehicles(){
  const zoom=map.getZoom();
  const plannedFilterActive=Boolean(window.__berlinPlannedVehicleFilter?.active);
  // Bei einer geplanten Verbindung immer große Fahrzeug-Icons zeigen.
  // So werden die relevanten Busse/Bahnen auch bei weit herausgezoomter Route klar sichtbar.
  const mode=plannedFilterActive?"icons":(zoom<=11?"dots":"icons");
  const bounds=map.getBounds().pad(plannedFilterActive?0.24:(zoom<=11?0.03:0.12));
  const wanted=new Set();
  let visible=0;'''
if old_render not in index:
    raise SystemExit('renderVehicles block not found')
index = index.replace(old_render, new_render, 1)

old_match = '''    const inArea=![leg.minLat,leg.maxLat,leg.minLon,leg.maxLon].every(Number.isFinite) ||
      (d.lat>=leg.minLat&&d.lat<=leg.maxLat&&d.lon>=leg.minLon&&d.lon<=leg.maxLon);
    if(!inArea)return false;

    const legDirection=routeFilterText(leg.direction);
    const textDirectionOk=Boolean(legDirection&&vehicleDirection&&
      (vehicleDirection.includes(legDirection)||legDirection.includes(vehicleDirection)));
    if(textDirectionOk)return true;

    // VBB radar direction labels are not always formatted like journey direction labels.
    // In that case use the vehicle's live bearing and the planned leg bearing.
    if(Number.isFinite(Number(leg.bearing))&&Number.isFinite(Number(d.bearing))){
      return angleDiff(d.bearing,leg.bearing)<=95;
    }

    // Last fallback: same mode + same line + inside the relevant route corridor.
    // This is preferable to hiding every relevant vehicle when the upstream omits direction metadata.
    return !vehicleDirection||!legDirection;'''
new_match = '''    const inArea=![leg.minLat,leg.maxLat,leg.minLon,leg.maxLon].every(Number.isFinite) ||
      (d.lat>=leg.minLat&&d.lat<=leg.maxLat&&d.lon>=leg.minLon&&d.lon<=leg.maxLon);

    const legDirection=routeFilterText(leg.direction);
    const textDirectionOk=Boolean(legDirection&&vehicleDirection&&
      (vehicleDirection.includes(legDirection)||legDirection.includes(vehicleDirection)));
    // Gleiche Linie + gleiche Zielrichtung: auch kurz vor dem eigentlichen Teilabschnitt anzeigen,
    // damit man sieht, wo das Fahrzeug herankommt.
    if(textDirectionOk)return true;

    // VBB-Radar und Journey-API benennen Ziele teilweise unterschiedlich.
    // Dann die echte Fahrtrichtung des Live-Fahrzeugs mit der Richtung des Reiseabschnitts vergleichen.
    if(Number.isFinite(Number(leg.bearing))&&Number.isFinite(Number(d.bearing))){
      const tolerance=inArea?120:75;
      return angleDiff(d.bearing,leg.bearing)<=tolerance;
    }

    // Fehlen Richtungsdaten, nur Fahrzeuge im Korridor der benötigten Teilstrecke zulassen.
    return inArea&&(!vehicleDirection||!legDirection);'''
if old_match not in index:
    raise SystemExit('planned route matcher block not found')
index = index.replace(old_match, new_match, 1)

# Put planned route lines below vehiclePane (vehiclePane is z-index 700),
# while keeping A/B endpoint markers above the vehicles.
enh = enh.replace('["plannerRouteHaloPane", "760"]', '["plannerRouteHaloPane", "650"]', 1)
enh = enh.replace('["plannerRoutePane", "770"]', '["plannerRoutePane", "660"]', 1)
enh = enh.replace('["plannerStopPane", "780"]', '["plannerStopPane", "820"]', 1)
if '["plannerRouteHaloPane", "650"]' not in enh or '["plannerRoutePane", "660"]' not in enh:
    raise SystemExit('planner pane z-index patch failed')

# Make the few remaining relevant vehicles stand out clearly on satellite imagery.
needle = '    .route-leg-badge{min-width:44px;padding:3px 5px;border-radius:7px;text-align:center;font-size:9px;font-weight:1000;background:var(--leg-color,#65758a);color:var(--leg-fg,#fff);border:1px solid rgba(255,255,255,.75)}\n'
extra = needle + '    body.planned-route-focus .veh{box-shadow:0 0 0 2px rgba(255,255,255,.98),0 0 0 5px rgba(5,10,16,.88),0 0 18px rgba(77,168,255,.75)!important}\n'
if 'body.planned-route-focus .veh{' not in enh:
    if needle not in enh:
        raise SystemExit('CSS insertion marker not found')
    enh = enh.replace(needle, extra, 1)

index_path.write_text(index, encoding='utf-8')
enh_path.write_text(enh, encoding='utf-8')

# Remove one-off patch files from final repository state.
Path('.github/route_vehicle_visibility_patch.py').unlink(missing_ok=True)
Path('.github/workflows/route-live-visibility.yml').unlink(missing_ok=True)
