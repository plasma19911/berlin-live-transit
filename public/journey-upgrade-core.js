(() => {
  "use strict";
  const J = window.__berlinJourneyUpgrade = window.__berlinJourneyUpgrade || {};
  J.version = "2026-08-13-live-journey-v2";
  J.state = J.state || {data:null,from:"",to:"",overlay:null,timer:null,renderTimer:null,filterSignature:""};
  J.mode = {
    suburban:{c:"#008d4c",fg:"#fff",label:"S"}, subway:{c:"#0067b1",fg:"#fff",label:"U"},
    tram:{c:"#ff8a00",fg:"#111",label:"TRAM"}, bus:{c:"#f6c900",fg:"#111",label:"BUS"},
    replacement:{c:"#c026d3",fg:"#fff",label:"SEV"}, ferry:{c:"#0077a8",fg:"#fff",label:"F"},
    regional:{c:"#e2001a",fg:"#fff",label:"RE"}, express:{c:"#e2001a",fg:"#fff",label:"ICE"}
  };
  J.$ = id => document.getElementById(id);
  J.esc = v => String(v ?? "").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  J.norm = v => String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"");
  J.normLine = v => J.norm(v).replace(/^(bus|tram|strassenbahn|sbahn|ubahn|regionalbahn|regionalexpress|express)+/,"");
  J.timeMs = v => { const n=new Date(v||0).getTime(); return Number.isFinite(n)&&n>0?n:NaN; };
  J.fmtTime = v => { const d=new Date(v||0); return Number.isNaN(d.getTime())?"—":d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}); };
  J.countdown = v => { const ms=J.timeMs(v); if(!Number.isFinite(ms))return""; const m=Math.round((ms-Date.now())/60000); if(m< -2)return"abgefahren"; if(m<=0)return"jetzt"; return m===1?"in 1 Min":`in ${m} Min`; };
  J.placePoint = place => { const p=place?.location||place,lat=Number(p?.latitude),lon=Number(p?.longitude); return Number.isFinite(lat)&&Number.isFinite(lon)?[lat,lon]:null; };
  J.placeName = (place,fallback="Haltestelle") => place?.name||place?.address||place?.location?.address||fallback;
  J.product = leg => {
    if(leg?.walking||!leg?.line)return"walking";
    const remarks=Array.isArray(leg?.remarks)?leg.remarks.map(r=>r?.text||r?.summary||"").join(" "):"";
    const text=[leg?.line?.name,leg?.line?.id,remarks].filter(Boolean).join(" ").toUpperCase();
    if(/\bSEV\b|SCHIENENERSATZVERKEHR|ERSATZVERKEHR|ERSATZBUS/.test(text))return"replacement";
    return J.mode[leg?.line?.product]?leg.line.product:"regional";
  };
  J.transitLegs = journey => (Array.isArray(journey?.legs)?journey.legs:[]).filter(l=>l?.line&&!l?.walking);
  J.firstTransitLeg = journey => J.transitLegs(journey)[0]||null;
  J.tripIdLeg = leg => String(leg?.tripId||leg?.trip?.id||"");
  J.tripIdVehicle = vehicle => { const r=vehicle?.raw||{}; return String(r.tripId||r.journeyId||r.trip?.id||""); };
  J.line = leg => String(leg?.line?.name||leg?.line?.id||"");
  J.liveForLeg = leg => {
    const s=window.__berlinLiveState;if(!s?.vehicles)return null;const tid=J.tripIdLeg(leg);if(!tid)return null;
    for(const [id,v] of s.vehicles.entries())if(J.tripIdVehicle(v)===tid)return{id,vehicle:v,exact:true};
    return null;
  };
  J.stopovers = leg => {
    const a=Array.isArray(leg?.stopovers)?leg.stopovers:[];if(a.length)return a;
    return [{stop:leg?.origin,departure:leg?.departure||leg?.plannedDeparture},{stop:leg?.destination,arrival:leg?.arrival||leg?.plannedArrival}].filter(x=>x.stop);
  };
  J.duration = journey => { const a=Array.isArray(journey?.legs)?journey.legs:[];if(!a.length)return null;const x=J.timeMs(a[0]?.departure||a[0]?.plannedDeparture),y=J.timeMs(a.at(-1)?.arrival||a.at(-1)?.plannedArrival);return Number.isFinite(x)&&Number.isFinite(y)&&y>=x?Math.round((y-x)/60000):null; };
  J.delayMin = leg => {
    for(const v of [leg?.departureDelay,leg?.arrivalDelay]){const n=Number(v);if(Number.isFinite(n))return Math.round(n/60);}
    const a=J.timeMs(leg?.departure||leg?.arrival),p=J.timeMs(leg?.plannedDeparture||leg?.plannedArrival);return Number.isFinite(a)&&Number.isFinite(p)?Math.round((a-p)/60000):0;
  };
  J.journeyKey = journey => J.transitLegs(journey).map(l=>`${J.tripIdLeg(l)}|${J.line(l)}|${l?.departure||l?.plannedDeparture||""}`).join("/");
  J.usefulJourneys = data => {
    const all=Array.isArray(data?.journeysWithinHour)?data.journeysWithinHour:[],key=J.journeyKey(data?.journey);
    return all.filter(j=>J.journeyKey(j)!==key).sort((a,b)=>J.timeMs(a?.legs?.[0]?.departure||a?.legs?.[0]?.plannedDeparture)-J.timeMs(b?.legs?.[0]?.departure||b?.legs?.[0]?.plannedDeparture)).slice(0,4);
  };
  J.restrictFilter = data => {
    const f=window.__berlinPlannedVehicleFilter;if(!f?.active||!Array.isArray(f.legs))return;
    const best=J.transitLegs(data?.journey),fallback=J.usefulJourneys(data).slice(0,2).map(J.firstTransitLeg).filter(Boolean),wanted=[...best,...fallback];
    const tids=new Set(wanted.map(J.tripIdLeg).filter(Boolean));
    const sigs=new Set(wanted.map(l=>`${J.normLine(J.line(l))}|${String(l?.departure||l?.plannedDeparture||"")}`));
    const selected=f.legs.filter(l=>(l?.tripId&&tids.has(String(l.tripId)))||sigs.has(`${J.normLine(l?.line||l?.lineId)}|${String(l?.departure||"")}`));
    if(!selected.length)return;
    const sig=selected.map(l=>`${l.tripId||""}|${l.line||l.lineId||""}|${l.departure||""}`).sort().join("/");
    if(sig===J.state.filterSignature)return;
    J.state.filterSignature=sig;f.legs=selected;f.fitVehiclesOnce=true;f.journeyCount=1+fallback.length;
    window.__berlinRouteEligibility={active:true,ready:false,ids:new Set()};
    window.dispatchEvent(new CustomEvent("berlin-live-vehicles-updated"));window.__berlinLiveMap?.fire("moveend");
  };
  J.schedule = (ms=50) => { clearTimeout(J.state.renderTimer);J.state.renderTimer=setTimeout(()=>J.render?.(),ms); };
  J.parseRoute = text => {
    const q=String(text||"").trim();let m=q.match(/^von\s+(.+?)\s+nach\s+(.+)$/i);if(m)return{from:m[1].trim(),to:m[2].trim()};
    m=q.match(/^(.+?\d.*?)\s+nach\s+(.+)$/i);if(m)return{from:m[1].trim(),to:m[2].trim()};
    for(const sep of ["→","->","=>"," > "]){const i=q.indexOf(sep);if(i>0)return{from:q.slice(0,i).trim(),to:q.slice(i+sep.length).trim()};}return null;
  };
  J.capture = (data,from,to) => {
    if(!data?.journey)return;J.state.data=data;J.state.filterSignature="";J.state.from=from||J.placeName(data?.from,"Start");J.state.to=to||J.placeName(data?.to,"Ziel");J.schedule(100);
  };
  J.loadRoute = async (from,to) => {
    try{const r=await fetch(`/api/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,{cache:"no-store",headers:{Accept:"application/json"}});if(!r.ok)return;J.capture(await r.json(),from,to);}catch(_){}
  };
  J.setupRouteObserver = () => {
    if(window.__berlinJourneyUpgradeObserver)return;window.__berlinJourneyUpgradeObserver=true;
    const trigger=()=>{const route=J.parseRoute(J.$("q")?.value);if(route)setTimeout(()=>J.loadRoute(route.from,route.to),140);};
    document.addEventListener("click",e=>{if(e.target?.closest?.("#search"))trigger();},true);
    document.addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target?.id==="q")trigger();},true);
  };
  J.start = () => {
    J.setupRouteObserver();
    window.addEventListener("berlin-live-vehicles-updated",()=>{if(J.state.data?.journey)J.schedule(100);});
    clearInterval(J.state.timer);J.state.timer=setInterval(()=>{if(J.state.data?.journey&&window.__berlinPlannedVehicleFilter?.active)J.schedule(0);},15000);
  };
})();