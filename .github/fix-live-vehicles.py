from pathlib import Path

index_path = Path('public/index.html')
enh_path = Path('public/enhancements.js')
index = index_path.read_text(encoding='utf-8')
enh = enh_path.read_text(encoding='utf-8')

# Ensure enhancements.js is actually loaded before the inline app creates the Leaflet map.
leaflet = '<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>\n'
if '<script src="/enhancements.js"></script>' not in index:
    if leaflet not in index:
        raise SystemExit('Leaflet script marker not found')
    index = index.replace(leaflet, leaflet + '<script src="/enhancements.js"></script>\n', 1)

start = index.index('function plannedRouteVehicleMatch(d){')
end = index.index('\nfunction vehicleVisibleInView', start)
new_match = r'''function plannedRouteVehicleMatch(d,{relaxed=false}={}){
  const filter=window.__berlinPlannedVehicleFilter;
  if(!filter||!filter.active||!Array.isArray(filter.legs)||!filter.legs.length)return true;

  const vehicleTrip=String(d.raw?.tripId||d.raw?.journeyId||d.raw?.trip?.id||"");
  const vehicleDirection=routeFilterText(d.raw?.direction||d.raw?.destination?.name||d.raw?.destination||"");
  const vehicleLines=[d.line,d.raw?.line?.name,d.raw?.line?.id]
    .map(canonicalRouteLine).filter(Boolean);

  return filter.legs.some(leg=>{
    const legTrip=String(leg.tripId||"");
    if(legTrip&&vehicleTrip&&legTrip===vehicleTrip)return true;

    // Bus/Tram/S/U usw. müssen zum geplanten Teilstück passen.
    if(leg.mode&&d.mode&&leg.mode!==d.mode){
      const railA=(leg.mode==="regional"||leg.mode==="express");
      const railB=(d.mode==="regional"||d.mode==="express");
      if(!(railA&&railB))return false;
    }

    const legLines=[leg.line,leg.lineId].map(canonicalRouteLine).filter(Boolean);
    const sameLine=vehicleLines.some(v=>legLines.some(l=>v===l || (v.length>1&&l.length>1&&(v.endsWith(l)||l.endsWith(v)))));
    if(!sameLine)return false;

    // Fail-safe: wenn die API keine konsistenten Richtungsdaten liefert,
    // lieber ein Live-Fahrzeug derselben benötigten Linie zeigen als eine leere Karte.
    if(relaxed)return true;

    const inArea=![leg.minLat,leg.maxLat,leg.minLon,leg.maxLon].every(Number.isFinite) ||
      (d.lat>=leg.minLat&&d.lat<=leg.maxLat&&d.lon>=leg.minLon&&d.lon<=leg.maxLon);

    const legDirection=routeFilterText(leg.direction);
    const textDirectionOk=Boolean(legDirection&&vehicleDirection&&
      (vehicleDirection.includes(legDirection)||legDirection.includes(vehicleDirection)));
    if(textDirectionOk)return true;

    if(Number.isFinite(Number(leg.bearing))&&Number.isFinite(Number(d.bearing))){
      const tolerance=inArea?135:80;
      if(angleDiff(d.bearing,leg.bearing)<=tolerance)return true;
    }

    return inArea&&(!vehicleDirection||!legDirection);
  });
}
'''
index = index[:start] + new_match + index[end:]

start = index.index('function renderVehicles(){')
end = index.index('\nfunction apply(){', start)
new_render = r'''function renderVehicles(){
  const zoom=map.getZoom();
  const routeFilter=window.__berlinPlannedVehicleFilter;
  const plannedFilterActive=Boolean(routeFilter?.active&&Array.isArray(routeFilter.legs)&&routeFilter.legs.length);
  const mode=plannedFilterActive?"icons":(zoom<=11?"dots":"icons");
  const bounds=map.getBounds().pad(plannedFilterActive?0.80:(zoom<=11?0.03:0.12));
  const wanted=new Set();
  let visible=0;

  let plannedIds=null;
  if(plannedFilterActive){
    const base=[...state.vehicles.entries()].filter(([,d])=>state.enabled.has(d.mode)&&vehicleVisibleInView(d,bounds));
    let matches=base.filter(([,d])=>plannedRouteVehicleMatch(d));
    if(!matches.length){
      matches=base.filter(([,d])=>plannedRouteVehicleMatch(d,{relaxed:true}));
    }
    plannedIds=new Set(matches.map(([id])=>id));
  }

  for(const [id,d] of state.vehicles){
    if(!state.enabled.has(d.mode))continue;
    if(plannedFilterActive){
      if(!plannedIds.has(id))continue;
    }else{
      if(state.query&&!d.search.includes(state.query))continue;
      if(state.focusSelected&&!isSelectedVehicle(d))continue;
      if(!vehicleVisibleInView(d,bounds))continue;
    }

    wanted.add(id);
    visible++;

    const rendered=state.markers.get(id);
    if(rendered && rendered.mode===mode){
      rendered.marker.setLatLng([d.lat,d.lon]);
      if(mode==="icons")rendered.marker.setIcon(icon(d.line,d.mode,d.bearing));
      continue;
    }

    if(rendered)removeRenderedMarker(id);
    const marker=createVehicleLayer(d,mode).addTo(map);
    state.markers.set(id,{marker,mode});
  }

  for(const id of [...state.markers.keys()]){
    if(!wanted.has(id))removeRenderedMarker(id);
  }

  state.renderMode=mode;
  $("visible").textContent=visible.toLocaleString("de-DE");
}
'''
index = index[:start] + new_render + index[end:]

# Store both line name and line id from journey legs for more reliable radar matching.
old = '            line:String(leg?.line?.name||leg?.line?.id||""),\n            mode:product,'
new = '            line:String(leg?.line?.name||leg?.line?.id||""),\n            lineId:String(leg?.line?.id||""),\n            mode:product,'
if old in enh and 'lineId:String(leg?.line?.id||"")' not in enh:
    enh = enh.replace(old, new, 1)

# Closing a planned-route detail panel restores the normal live map immediately.
needle = '    $("clearRoutes")?.addEventListener("click", clearPlannedRoute, true);\n'
extra = needle + '    $("detailClose")?.addEventListener("click", () => { if (window.__berlinPlannedVehicleFilter?.active) clearPlannedRoute(); }, true);\n'
if needle in enh and 'detailClose")?.addEventListener("click", () => { if (window.__berlinPlannedVehicleFilter?.active)' not in enh:
    enh = enh.replace(needle, extra, 1)

index_path.write_text(index, encoding='utf-8')
enh_path.write_text(enh, encoding='utf-8')
