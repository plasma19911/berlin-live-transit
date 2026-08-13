from pathlib import Path

index = Path('public/index.html')
enh = Path('public/enhancements.js')

h = index.read_text(encoding='utf-8')
s = enh.read_text(encoding='utf-8')

# Main renderer: while a planned route is active, only render vehicles relevant
# to one of the public-transport legs of that route.
helper_marker = 'function vehicleVisibleInView(d,bounds){\n'
helper = r'''function routeFilterText(value){
  return String(value||"")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"")
    .trim();
}

function plannedRouteVehicleMatch(d){
  const filter=window.__berlinPlannedVehicleFilter;
  if(!filter||!filter.active||!Array.isArray(filter.legs)||!filter.legs.length)return true;

  const vehicleLine=routeFilterText(d.line);
  const vehicleDirection=routeFilterText(d.raw?.direction||d.raw?.destination?.name||d.raw?.destination||"");
  const vehicleTrip=String(d.raw?.tripId||d.raw?.journeyId||d.raw?.trip?.id||"");

  return filter.legs.some(leg=>{
    const legTrip=String(leg.tripId||"");
    if(legTrip&&vehicleTrip&&legTrip===vehicleTrip)return true;

    if(!vehicleLine||vehicleLine!==routeFilterText(leg.line))return false;

    const legDirection=routeFilterText(leg.direction);
    if(!legDirection||!vehicleDirection)return false;
    const sameDirection=vehicleDirection.includes(legDirection)||legDirection.includes(vehicleDirection);
    if(!sameDirection)return false;

    if([leg.minLat,leg.maxLat,leg.minLon,leg.maxLon].every(Number.isFinite)){
      return d.lat>=leg.minLat&&d.lat<=leg.maxLat&&d.lon>=leg.minLon&&d.lon<=leg.maxLon;
    }
    return true;
  });
}

function vehicleVisibleInView(d,bounds){
'''
if 'function plannedRouteVehicleMatch(d)' not in h:
    if helper_marker not in h:
        raise SystemExit('vehicleVisibleInView marker not found')
    h = h.replace(helper_marker, helper, 1)

render_marker = '    if(!state.enabled.has(d.mode))continue;\n    if(state.query&&!d.search.includes(state.query))continue;\n'
render_repl = '    if(!state.enabled.has(d.mode))continue;\n    if(!plannedRouteVehicleMatch(d))continue;\n    if(state.query&&!d.search.includes(state.query))continue;\n'
if 'if(!plannedRouteVehicleMatch(d))continue;' not in h:
    if render_marker not in h:
        raise SystemExit('renderVehicles filter marker not found')
    h = h.replace(render_marker, render_repl, 1)

index.write_text(h, encoding='utf-8')

# Route planner: keep the normal vehicle pane visible; hide only manually selected
# trip route layers. Set a global filter containing the route's relevant live vehicles.
s = s.replace('const names = ["vehiclePane", "routeHaloPane", "routePane", "tripStopPane"];',
              'const names = ["routeHaloPane", "routePane", "tripStopPane"];')

clear_marker = '    routeState.layers = [];\n    setRouteFocus(false);\n'
clear_repl = '''    routeState.layers = [];
    window.__berlinPlannedVehicleFilter={active:false,legs:[]};
    setRouteFocus(false);
    if(map)map.fire("moveend");
'''
if 'window.__berlinPlannedVehicleFilter={active:false,legs:[]};' not in s:
    if clear_marker not in s:
        raise SystemExit('clear route marker not found')
    s = s.replace(clear_marker, clear_repl, 1)

bounds_marker = '      const bounds = L.latLngBounds([]), layers = [];\n      const transitLegs = legs.filter(l => l?.line && !l?.walking);\n'
bounds_repl = '''      const bounds = L.latLngBounds([]), layers = [];
      const transitLegs = legs.filter(l => l?.line && !l?.walking);
      const relevantVehicleLegs=[];
'''
if 'const relevantVehicleLegs=[];' not in s:
    if bounds_marker not in s:
        raise SystemExit('route bounds marker not found')
    s = s.replace(bounds_marker, bounds_repl, 1)

loop_marker = '''        const product = legProduct(leg), walking = product === "walking";
        const color = walking ? "#e7eef7" : (modeInfo[product]?.c || "#4da8ff");
'''
loop_repl = '''        const product = legProduct(leg), walking = product === "walking";
        if(!walking&&leg?.line){
          const lats=coords.map(p=>Number(p[0])).filter(Number.isFinite);
          const lons=coords.map(p=>Number(p[1])).filter(Number.isFinite);
          const padLat=.018;
          const padLon=.030;
          relevantVehicleLegs.push({
            line:String(leg?.line?.name||leg?.line?.id||""),
            direction:String(leg?.direction||leg?.destination?.name||""),
            tripId:String(leg?.tripId||leg?.trip?.id||""),
            minLat:lats.length?Math.min(...lats)-padLat:null,
            maxLat:lats.length?Math.max(...lats)+padLat:null,
            minLon:lons.length?Math.min(...lons)-padLon:null,
            maxLon:lons.length?Math.max(...lons)+padLon:null
          });
        }
        const color = walking ? "#e7eef7" : (modeInfo[product]?.c || "#4da8ff");
'''
if 'relevantVehicleLegs.push({' not in s:
    if loop_marker not in s:
        raise SystemExit('route leg marker not found')
    s = s.replace(loop_marker, loop_repl, 1)

state_marker = '      routeState.layers = layers;\n      if (bounds.isValid()) map.fitBounds(bounds.pad(.08),'
state_repl = '''      routeState.layers = layers;
      window.__berlinPlannedVehicleFilter={active:true,legs:relevantVehicleLegs};
      map.fire("moveend");
      if (bounds.isValid()) map.fitBounds(bounds.pad(.08),'''
if 'window.__berlinPlannedVehicleFilter={active:true,legs:relevantVehicleLegs};' not in s:
    if state_marker not in s:
        raise SystemExit('route state marker not found')
    s = s.replace(state_marker, state_repl, 1)

chip_old = '<span>Beste gefundene ÖPNV-Verbindung markiert</span>'
chip_new = '<span>Route + passende Live-Fahrzeuge in deiner Fahrtrichtung</span>'
s = s.replace(chip_old, chip_new)

enh.write_text(s, encoding='utf-8')

# Self cleanup. Workflow removes itself separately.
Path('.github/relevant_route_vehicles_patch.py').unlink(missing_ok=True)
