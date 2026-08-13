from pathlib import Path

p=Path('public/enhancements.js')
s=p.read_text(encoding='utf-8')

s=s.replace('if (title) title.textContent = "🧭 Beste Verbindung";', 'if (title) title.textContent = "🧭 Verbindungen · nächste 60 Min";', 1)
s=s.replace("if (body) body.innerHTML = '<div class=\"detail-loading\">Adresse und beste Verbindung werden gesucht …</div>';", "if (body) body.innerHTML = '<div class=\"detail-loading\">Adresse und Verbindungen der nächsten 60 Minuten werden gesucht …</div>';", 1)

old='''      const journey = data?.journey;\n      const legs = Array.isArray(journey?.legs) ? journey.legs : [];\n      if (!legs.length) throw new Error("Keine Verbindung gefunden.");\n\n      setRouteFocus(true);\n      ensurePlannerPanes(map);\n      const bounds = L.latLngBounds([]), layers = [];\n      const transitLegs = legs.filter(l => l?.line && !l?.walking);\n      const relevantVehicleLegs=[];\n      for (const leg of legs) {'''
new='''      const journey = data?.journey;\n      const legs = Array.isArray(journey?.legs) ? journey.legs : [];\n      if (!legs.length) throw new Error("Keine Verbindung gefunden.");\n      const hourJourneys = Array.isArray(data?.journeysWithinHour) && data.journeysWithinHour.length\n        ? data.journeysWithinHour\n        : [journey];\n\n      setRouteFocus(true);\n      ensurePlannerPanes(map);\n      const bounds = L.latLngBounds([]), layers = [];\n      const transitLegs = legs.filter(l => l?.line && !l?.walking);\n      const relevantVehicleLegs=[];\n      const relevantVehicleKeys=new Set();\n\n      const registerRelevantLeg=(leg,coordsHint=null)=>{\n        if(!leg?.line||leg?.walking)return;\n        let coords=Array.isArray(coordsHint)&&coordsHint.length>=2?coordsHint:flattenPolyline(leg?.polyline);\n        if(coords.length<2){\n          const a=legPoint(leg?.origin),b=legPoint(leg?.destination);\n          if(a&&b)coords=[a,b];\n        }\n        if(coords.length<2)return;\n        const product=legProduct(leg);\n        const lats=coords.map(p=>Number(p[0])).filter(Number.isFinite);\n        const lons=coords.map(p=>Number(p[1])).filter(Number.isFinite);\n        const first=coords[0],last=coords[coords.length-1];\n        const toRad=x=>Number(x)*Math.PI/180;\n        const toDeg=x=>Number(x)*180/Math.PI;\n        const y=Math.sin(toRad(last[1]-first[1]))*Math.cos(toRad(last[0]));\n        const x=Math.cos(toRad(first[0]))*Math.sin(toRad(last[0]))-Math.sin(toRad(first[0]))*Math.cos(toRad(last[0]))*Math.cos(toRad(last[1]-first[1]));\n        const legBearing=(toDeg(Math.atan2(y,x))+360)%360;\n        const boarding=legPoint(leg?.origin);\n        const tripId=String(leg?.tripId||leg?.trip?.id||"");\n        const line=String(leg?.line?.name||leg?.line?.id||"");\n        const lineId=String(leg?.line?.id||"");\n        const departure=String(leg?.departure||leg?.plannedDeparture||"");\n        const boardName=String(leg?.origin?.name||leg?.origin?.address||"");\n        const key=tripId||[product,line,lineId,departure,boardName].join("|");\n        if(relevantVehicleKeys.has(key))return;\n        relevantVehicleKeys.add(key);\n        const padLat=.018,padLon=.030;\n        relevantVehicleLegs.push({\n          line,lineId,mode:product,\n          direction:String(leg?.direction||leg?.destination?.name||""),\n          tripId,departure,boardName,\n          boardLat:boarding?Number(boarding[0]):null,\n          boardLon:boarding?Number(boarding[1]):null,\n          bearing:Number.isFinite(legBearing)?legBearing:null,\n          minLat:lats.length?Math.min(...lats)-padLat:null,\n          maxLat:lats.length?Math.max(...lats)+padLat:null,\n          minLon:lons.length?Math.min(...lons)-padLon:null,\n          maxLon:lons.length?Math.max(...lons)+padLon:null\n        });\n      };\n\n      for (const leg of legs) {'''
if old not in s:
    raise SystemExit('main route header block not found')
s=s.replace(old,new,1)

old2='''        if(!walking&&leg?.line){\n          const lats=coords.map(p=>Number(p[0])).filter(Number.isFinite);\n          const lons=coords.map(p=>Number(p[1])).filter(Number.isFinite);\n          const padLat=.018;\n          const padLon=.030;\n          const first=coords[0], last=coords[coords.length-1];\n          const toRad=x=>Number(x)*Math.PI/180;\n          const toDeg=x=>Number(x)*180/Math.PI;\n          const y=Math.sin(toRad(last[1]-first[1]))*Math.cos(toRad(last[0]));\n          const x=Math.cos(toRad(first[0]))*Math.sin(toRad(last[0]))-Math.sin(toRad(first[0]))*Math.cos(toRad(last[0]))*Math.cos(toRad(last[1]-first[1]));\n          const legBearing=(toDeg(Math.atan2(y,x))+360)%360;\n          const boarding=legPoint(leg?.origin);\n          relevantVehicleLegs.push({\n            line:String(leg?.line?.name||leg?.line?.id||""),\n            lineId:String(leg?.line?.id||""),\n            mode:product,\n            direction:String(leg?.direction||leg?.destination?.name||""),\n            tripId:String(leg?.tripId||leg?.trip?.id||""),\n            departure:String(leg?.departure||leg?.plannedDeparture||""),\n            boardName:String(leg?.origin?.name||leg?.origin?.address||""),\n            boardLat:boarding?Number(boarding[0]):null,\n            boardLon:boarding?Number(boarding[1]):null,\n            bearing:Number.isFinite(legBearing)?legBearing:null,\n            minLat:lats.length?Math.min(...lats)-padLat:null,\n            maxLat:lats.length?Math.max(...lats)+padLat:null,\n            minLon:lons.length?Math.min(...lons)-padLon:null,\n            maxLon:lons.length?Math.max(...lons)+padLon:null\n          });\n        }'''
new2='''        if(!walking&&leg?.line)registerRelevantLeg(leg,coords);'''
if old2 not in s:
    raise SystemExit('old relevant leg block not found')
s=s.replace(old2,new2,1)

needle='''        layers.push(halo, line);\n      }\n\n      const start = legPoint(data?.from) || legPoint(legs[0]?.origin);'''
insert='''        layers.push(halo, line);\n      }\n\n      // Alle ÖPNV-Teilstrecken aller Verbindungen sammeln, deren Start in den nächsten 60 Minuten liegt.\n      // So können gleichzeitig der kommende Zubringer, spätere Umstiegsbahnen und weitere nutzbare Abfahrten live sichtbar sein.\n      for(const option of hourJourneys){\n        for(const optionLeg of (Array.isArray(option?.legs)?option.legs:[])){\n          registerRelevantLeg(optionLeg);\n        }\n      }\n\n      const start = legPoint(data?.from) || legPoint(legs[0]?.origin);'''
if needle not in s:
    raise SystemExit('aggregation insertion point not found')
s=s.replace(needle,insert,1)

old3='''        active:true,\n        legs:relevantVehicleLegs,\n        fitVehiclesOnce:true,'''
new3='''        active:true,\n        legs:relevantVehicleLegs,\n        journeyCount:hourJourneys.length,\n        windowMinutes:Number(data?.routeWindowMinutes)||60,\n        fitVehiclesOnce:true,'''
if old3 not in s:
    raise SystemExit('filter metadata block not found')
s=s.replace(old3,new3,1)

old4='''      if (body) body.innerHTML = `<div class="detail-grid"><div class="detail-key">Dauer</div><div><b>${durationText(journey)}</b></div><div class="detail-key">Abfahrt</div><div>${fmtTime(dep)}</div><div class="detail-key">Ankunft</div><div>${fmtTime(arr)}</div><div class="detail-key">Umstiege</div><div>${transfers}</div></div><div class="route-chip"><span class="route-line-sample"></span><span>Route + Live-Fahrzeuge, die deinen Einstieg noch erreichen</span></div><div class="detail-section"><h3>Strecke</h3>${legRows}</div>`;'''
new4='''      if (body) body.innerHTML = `<div class="detail-grid"><div class="detail-key">Beste Dauer</div><div><b>${durationText(journey)}</b></div><div class="detail-key">Abfahrt</div><div>${fmtTime(dep)}</div><div class="detail-key">Ankunft</div><div>${fmtTime(arr)}</div><div class="detail-key">Umstiege</div><div>${transfers}</div><div class="detail-key">Verbindungen +60 Min</div><div><b>${hourJourneys.length}</b></div></div><div class="route-chip"><span class="route-line-sample"></span><span>Alle passenden Live-Fahrzeuge bis zum Ziel · Start innerhalb der nächsten 60 Min</span></div><div class="detail-section"><h3>Beste Strecke</h3>${legRows}</div>`;'''
if old4 not in s:
    raise SystemExit('detail body block not found')
s=s.replace(old4,new4,1)

p.write_text(s,encoding='utf-8')

# remove one-off files after patch
Path('.github/next-hour-route-vehicles.py').unlink(missing_ok=True)
Path('.github/workflows/next-hour-route-vehicles.yml').unlink(missing_ok=True)
