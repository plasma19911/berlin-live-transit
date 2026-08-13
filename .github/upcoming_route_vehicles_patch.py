from pathlib import Path

index_path = Path('public/index.html')
enh_path = Path('public/enhancements.js')
index = index_path.read_text(encoding='utf-8')
enh = enh_path.read_text(encoding='utf-8')

# 1) Add geo helpers after angleDiff.
needle = '''function angleDiff(a,b){\n  if(!Number.isFinite(Number(a))||!Number.isFinite(Number(b)))return 180;\n  let d=Math.abs((Number(a)-Number(b))%360);\n  if(d>180)d=360-d;\n  return d;\n}\n\n'''
insert = needle + '''function distanceMeters(aLat,aLon,bLat,bLon){\n  const vals=[aLat,aLon,bLat,bLon].map(Number);\n  if(!vals.every(Number.isFinite))return null;\n  const [lat1,lon1,lat2,lon2]=vals;\n  const R=6371000;\n  const p1=lat1*Math.PI/180,p2=lat2*Math.PI/180;\n  const dp=(lat2-lat1)*Math.PI/180,dl=(lon2-lon1)*Math.PI/180;\n  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;\n  return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));\n}\n\nfunction routeApproachInfo(d,leg){\n  const boardLat=Number(leg.boardLat),boardLon=Number(leg.boardLon),legBearing=Number(leg.bearing);\n  if(![boardLat,boardLon,legBearing,d.lat,d.lon].every(Number.isFinite))return null;\n  const dist=distanceMeters(boardLat,boardLon,d.lat,d.lon);\n  if(!Number.isFinite(dist))return null;\n  const fromBoard=bearingBetween({lat:boardLat,lon:boardLon},{lat:d.lat,lon:d.lon});\n  if(!Number.isFinite(fromBoard))return null;\n  const diff=angleDiff(fromBoard,legBearing);\n  // Positive Projektion = Fahrzeug liegt bereits hinter dem Einstieg in Fahrtrichtung.\n  // Negative Projektion = Fahrzeug befindet sich noch vor dem Einstieg und kommt erst noch.\n  const along=dist*Math.cos(diff*Math.PI/180);\n  return {dist,along,coming:along<=650};\n}\n\n'''
if 'function routeApproachInfo(' not in index:
    if needle not in index:
        raise SystemExit('angleDiff insertion point not found')
    index = index.replace(needle, insert, 1)

# 2) Replace plannedRouteVehicleMatch with upcoming-aware version.
start = index.find('function plannedRouteVehicleMatch(d,{relaxed=false}={}){')
end = index.find('\nfunction vehicleVisibleInView', start)
if start < 0 or end < 0:
    raise SystemExit('plannedRouteVehicleMatch block not found')
new_match = '''function plannedRouteVehicleMatch(d,{relaxed=false}={}){\n  const filter=window.__berlinPlannedVehicleFilter;\n  if(!filter||!filter.active||!Array.isArray(filter.legs)||!filter.legs.length)return true;\n\n  const vehicleTrip=String(d.raw?.tripId||d.raw?.journeyId||d.raw?.trip?.id||\"\");\n  const vehicleDirection=routeFilterText(d.raw?.direction||d.raw?.destination?.name||d.raw?.destination||\"\");\n  const vehicleLines=[d.line,d.raw?.line?.name,d.raw?.line?.id]\n    .map(canonicalRouteLine).filter(Boolean);\n\n  return filter.legs.some(leg=>{\n    if(leg.mode&&d.mode&&leg.mode!==d.mode){\n      const railA=(leg.mode===\"regional\"||leg.mode===\"express\");\n      const railB=(d.mode===\"regional\"||d.mode===\"express\");\n      if(!(railA&&railB))return false;\n    }\n\n    const legLines=[leg.line,leg.lineId].map(canonicalRouteLine).filter(Boolean);\n    const sameLine=vehicleLines.some(v=>legLines.some(l=>v===l || (v.length>1&&l.length>1&&(v.endsWith(l)||l.endsWith(v)))));\n    if(!sameLine)return false;\n\n    const approach=routeApproachInfo(d,leg);\n    // Wenn wir die Position relativ zum Einstieg bestimmen können, Fahrzeuge nach dem Einstieg ausblenden.\n    if(approach && !approach.coming)return false;\n    // Sehr weit entfernte Fahrzeuge derselben Linie sind für den aktuellen Einstieg nicht hilfreich.\n    if(approach && approach.dist>22000)return false;\n\n    const legTrip=String(leg.tripId||\"\");\n    if(legTrip&&vehicleTrip&&legTrip===vehicleTrip)return true;\n\n    const legDirection=routeFilterText(leg.direction);\n    const textDirectionOk=Boolean(legDirection&&vehicleDirection&&\n      (vehicleDirection.includes(legDirection)||legDirection.includes(vehicleDirection)));\n    if(textDirectionOk)return true;\n\n    if(Number.isFinite(Number(leg.bearing))&&Number.isFinite(Number(d.bearing))){\n      const tolerance=approach&&approach.dist<5000?120:75;\n      if(angleDiff(d.bearing,leg.bearing)<=tolerance)return true;\n    }\n\n    // Relaxed Fallback: gleiche benötigte Linie, aber weiterhin nur Fahrzeuge, die den Einstieg noch nicht passiert haben.\n    if(relaxed)return !approach || approach.coming;\n\n    return Boolean(approach&&approach.coming&&(!vehicleDirection||!legDirection));\n  });\n}\n'''
index = index[:start] + new_match + index[end:]

# 3) Planned mode should search all loaded Berlin vehicles, not only the current viewport.
old = '''  if(plannedFilterActive){\n    const base=[...state.vehicles.entries()].filter(([,d])=>state.enabled.has(d.mode)&&vehicleVisibleInView(d,bounds));\n    let matches=base.filter(([,d])=>plannedRouteVehicleMatch(d));\n    if(!matches.length){\n      matches=base.filter(([,d])=>plannedRouteVehicleMatch(d,{relaxed:true}));\n    }\n    plannedIds=new Set(matches.map(([id])=>id));\n  }\n'''
new = '''  if(plannedFilterActive){\n    const base=[...state.vehicles.entries()].filter(([,d])=>state.enabled.has(d.mode));\n    let matches=base.filter(([,d])=>plannedRouteVehicleMatch(d));\n    if(!matches.length){\n      matches=base.filter(([,d])=>plannedRouteVehicleMatch(d,{relaxed:true}));\n    }\n    plannedIds=new Set(matches.map(([id])=>id));\n\n    // Beim ersten Anzeigen Route + noch kommende Fahrzeuge gemeinsam in den Ausschnitt nehmen.\n    if(routeFilter.fitVehiclesOnce&&matches.length){\n      routeFilter.fitVehiclesOnce=false;\n      const focus=L.latLngBounds(matches.map(([,d])=>[d.lat,d.lon]));\n      const rb=routeFilter.routeBounds;\n      if(rb&&[rb.south,rb.west,rb.north,rb.east].every(Number.isFinite)){\n        focus.extend([rb.south,rb.west]);\n        focus.extend([rb.north,rb.east]);\n      }\n      if(focus.isValid()){\n        map.fitBounds(focus.pad(.08),{\n          maxZoom:14,\n          paddingTopLeft:[20,70],\n          paddingBottomRight:[20,window.innerWidth<=700?205:20],\n          animate:true,\n          duration:.35\n        });\n      }\n    }\n  }\n'''
if old not in index:
    raise SystemExit('planned render block not found')
index = index.replace(old, new, 1)

# 4) Save boarding point and departure time per transit leg.
old_push = '''          relevantVehicleLegs.push({\n            line:String(leg?.line?.name||leg?.line?.id||\"\"),\n            lineId:String(leg?.line?.id||\"\"),\n            mode:product,\n            direction:String(leg?.direction||leg?.destination?.name||\"\"),\n            tripId:String(leg?.tripId||leg?.trip?.id||\"\"),\n            bearing:Number.isFinite(legBearing)?legBearing:null,\n            minLat:lats.length?Math.min(...lats)-padLat:null,\n            maxLat:lats.length?Math.max(...lats)+padLat:null,\n            minLon:lons.length?Math.min(...lons)-padLon:null,\n            maxLon:lons.length?Math.max(...lons)+padLon:null\n          });\n'''
new_push = '''          const boarding=legPoint(leg?.origin);\n          relevantVehicleLegs.push({\n            line:String(leg?.line?.name||leg?.line?.id||\"\"),\n            lineId:String(leg?.line?.id||\"\"),\n            mode:product,\n            direction:String(leg?.direction||leg?.destination?.name||\"\"),\n            tripId:String(leg?.tripId||leg?.trip?.id||\"\"),\n            departure:String(leg?.departure||leg?.plannedDeparture||\"\"),\n            boardName:String(leg?.origin?.name||leg?.origin?.address||\"\"),\n            boardLat:boarding?Number(boarding[0]):null,\n            boardLon:boarding?Number(boarding[1]):null,\n            bearing:Number.isFinite(legBearing)?legBearing:null,\n            minLat:lats.length?Math.min(...lats)-padLat:null,\n            maxLat:lats.length?Math.max(...lats)+padLat:null,\n            minLon:lons.length?Math.min(...lons)-padLon:null,\n            maxLon:lons.length?Math.max(...lons)+padLon:null\n          });\n'''
if old_push not in enh:
    raise SystemExit('relevantVehicleLegs push block not found')
enh = enh.replace(old_push, new_push, 1)

# 5) Include route bounds and one-time fit request in the planned vehicle filter.
old_filter = '      window.__berlinPlannedVehicleFilter={active:true,legs:relevantVehicleLegs};\n      map.fire("moveend");\n      if (bounds.isValid()) map.fitBounds(bounds.pad(.08), { maxZoom: 15, paddingTopLeft: [20,70], paddingBottomRight: [20, innerWidth <= 700 ? 205 : 20] });\n'
new_filter = '''      window.__berlinPlannedVehicleFilter={\n        active:true,\n        legs:relevantVehicleLegs,\n        fitVehiclesOnce:true,\n        routeBounds:bounds.isValid()?{south:bounds.getSouth(),west:bounds.getWest(),north:bounds.getNorth(),east:bounds.getEast()}:null\n      };\n      if (bounds.isValid()) map.fitBounds(bounds.pad(.08), { maxZoom: 15, paddingTopLeft: [20,70], paddingBottomRight: [20, innerWidth <= 700 ? 205 : 20] });\n      else map.fire("moveend");\n'''
if old_filter not in enh:
    raise SystemExit('planned vehicle filter assignment not found')
enh = enh.replace(old_filter, new_filter, 1)

# 6) Update explanatory chip text.
enh = enh.replace('Route + passende Live-Fahrzeuge in deiner Fahrtrichtung', 'Route + Live-Fahrzeuge, die deinen Einstieg noch erreichen', 1)

# Sanity checks
checks = [
    'function routeApproachInfo(',
    'approach && !approach.coming',
    'fitVehiclesOnce',
]
for c in checks:
    if c not in index:
        raise SystemExit(f'missing index check: {c}')
for c in ['boardLat:', 'boardLon:', 'Route + Live-Fahrzeuge, die deinen Einstieg noch erreichen']:
    if c not in enh:
        raise SystemExit(f'missing enhancements check: {c}')

index_path.write_text(index, encoding='utf-8')
enh_path.write_text(enh, encoding='utf-8')

# Clean up one-off patch files from the final repository state.
Path('.github/upcoming_route_vehicles_patch.py').unlink(missing_ok=True)
Path('.github/workflows/upcoming-route-vehicles.yml').unlink(missing_ok=True)
