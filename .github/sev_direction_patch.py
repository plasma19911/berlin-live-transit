from pathlib import Path

idx_path=Path('public/index.html')
enh_path=Path('public/enhancements.js')
idx=idx_path.read_text(encoding='utf-8')
enh=enh_path.read_text(encoding='utf-8')

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old,new,1)

# --- Index: distinct replacement-service mode ---
idx=replace_once(idx,
'''  bus:{name:"Bus",kind:"bus",c:"#f6c900",fg:"#111111",icon:"BUS"},
  ferry:{name:"Fähre",kind:"ferry",c:"#0077a8",fg:"#ffffff",icon:"⚓"},''',
'''  bus:{name:"Bus",kind:"bus",c:"#f6c900",fg:"#111111",icon:"BUS"},
  replacement:{name:"Ersatzverkehr",kind:"replacement",c:"#c026d3",fg:"#ffffff",icon:"SEV"},
  ferry:{name:"Fähre",kind:"ferry",c:"#0077a8",fg:"#ffffff",icon:"⚓"},''',
'modes replacement')

idx=replace_once(idx,
'''function classify(m){
  const p=(m.line&&m.line.product)||m.product||"";
  if(modes[p]) return p;

  const name=((m.line&&m.line.name)||"").toUpperCase().trim();''',
'''function classify(m){
  const remarks=Array.isArray(m.remarks)
    ? m.remarks.map(r=>r?.text||r?.summary||r?.code||"").join(" ")
    : "";
  const replacementText=[m.line?.name,m.line?.id,m.name,m.direction,m.destination?.name,remarks]
    .filter(Boolean).join(" ").toUpperCase();
  if(/\\bSEV\\b|SCHIENENERSATZVERKEHR|ERSATZVERKEHR|ERSATZBUS/.test(replacementText)) return "replacement";

  const p=(m.line&&m.line.product)||m.product||"";
  if(modes[p]) return p;

  const name=((m.line&&m.line.name)||"").toUpperCase().trim();''',
'classify replacement')

# Make direction arrow more obvious: stemmed arrow in a high-contrast badge.
idx=idx.replace('title="Fahrtrichtung">▲</span>','title="Fahrtrichtung">↑</span>',1)

old_arrow='''.veh-arrow{
  position:absolute;left:50%;top:-8px;
  width:16px;height:16px;margin-left:-8px;
  display:grid;place-items:center;
  color:#fff;
  font-size:14px;line-height:1;font-weight:1000;
  transform:rotate(var(--bearing,0deg));
  transform-origin:50% 28px;
  transition:transform .25s ease;
  pointer-events:none;
  text-shadow:0 1px 3px rgba(0,0,0,.95);
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.8));
}
body.map-bright .veh-arrow{
  color:#101820;
  text-shadow:0 0 2px rgba(255,255,255,1),0 1px 4px rgba(255,255,255,.95);
  filter:drop-shadow(0 1px 1px rgba(255,255,255,.9));
}'''
new_arrow='''.veh-arrow{
  position:absolute;left:50%;top:-12px;
  width:22px;height:22px;margin-left:-11px;
  display:grid;place-items:center;
  color:#fff;background:rgba(5,10,18,.96);
  border:2px solid #fff;border-radius:50%;
  font-size:17px;line-height:18px;font-weight:1000;
  transform:rotate(var(--bearing,0deg));
  transform-origin:50% 36px;
  transition:transform .25s ease;
  pointer-events:none;
  text-shadow:none;
  box-shadow:0 0 0 1px rgba(0,0,0,.68),0 2px 7px rgba(0,0,0,.62);
  filter:none;
}
body.map-bright .veh-arrow{
  color:#fff;background:rgba(5,10,18,.96);
  border-color:#fff;text-shadow:none;filter:none;
}'''
idx=replace_once(idx,old_arrow,new_arrow,'arrow css')

idx=replace_once(idx,
'''.veh.kind-bus,.veh.kind-tram{min-width:48px;height:40px;border-radius:9px;padding:2px 6px 3px}
.veh.kind-ferry{min-width:36px;width:36px;height:36px;border-radius:50%}''',
'''.veh.kind-bus,.veh.kind-tram{min-width:48px;height:40px;border-radius:9px;padding:2px 6px 3px}
.veh.kind-replacement{min-width:50px;height:40px;border-radius:9px;padding:2px 6px 3px;background:linear-gradient(135deg,var(--c) 0 72%,#7d168d 72% 100%)}
.veh.kind-ferry{min-width:36px;width:36px;height:36px;border-radius:50%}''',
'replacement vehicle css')

idx=replace_once(idx,
'''.kind-tram .veh-symbol{font-size:8px;min-height:12px;letter-spacing:.035em}
.veh-line{''',
'''.kind-tram .veh-symbol{font-size:8px;min-height:12px;letter-spacing:.035em}
.kind-replacement .veh-symbol{font-size:10px;min-height:12px;letter-spacing:.08em}
.veh-line{''',
'replacement symbol css')

idx=replace_once(idx,
'''.kind-bus .veh-line,.kind-tram .veh-line{max-width:44px;font-size:11px;line-height:12px}
.kind-s .veh-line,.kind-u .veh-line{font-size:8px}''',
'''.kind-bus .veh-line,.kind-tram .veh-line{max-width:44px;font-size:11px;line-height:12px}
.kind-replacement .veh-line{max-width:46px;font-size:10px;line-height:11px}
.kind-s .veh-line,.kind-u .veh-line{font-size:8px}''',
'replacement line css')

idx=replace_once(idx,
'''.legend-sign.kind-bus,.legend-sign.kind-tram{width:30px;font-size:7px;letter-spacing:.02em}
.search{''',
'''.legend-sign.kind-bus,.legend-sign.kind-tram{width:30px;font-size:7px;letter-spacing:.02em}
.legend-sign.kind-replacement{width:32px;font-size:8px;letter-spacing:.05em;border-radius:7px}
.search{''',
'replacement legend css')

idx=replace_once(idx,
'''  .veh.kind-bus,.veh.kind-tram{min-width:44px;height:36px;padding:2px 5px}
  .veh.kind-regional,.veh.kind-express{min-width:39px;height:33px}''',
'''  .veh.kind-bus,.veh.kind-tram{min-width:44px;height:36px;padding:2px 5px}
  .veh.kind-replacement{min-width:46px;height:36px;padding:2px 5px}
  .veh.kind-regional,.veh.kind-express{min-width:39px;height:33px}''',
'mobile replacement size')

idx=replace_once(idx,
'''  .kind-tram .veh-symbol{font-size:7px;min-height:10px}
  .veh-line{font-size:9px;line-height:10px;max-width:38px}''',
'''  .kind-tram .veh-symbol{font-size:7px;min-height:10px}
  .kind-replacement .veh-symbol{font-size:9px;min-height:10px}
  .veh-line{font-size:9px;line-height:10px;max-width:38px}''',
'mobile replacement symbol')

idx=replace_once(idx,
'''  .kind-bus .veh-line,.kind-tram .veh-line{font-size:10px;line-height:11px;max-width:40px}
  .veh-arrow{top:-6px;font-size:12px;width:14px;height:14px;margin-left:-7px;transform-origin:50% 25px}''',
'''  .kind-bus .veh-line,.kind-tram .veh-line{font-size:10px;line-height:11px;max-width:40px}
  .kind-replacement .veh-line{font-size:9px;line-height:10px;max-width:42px}
  .veh-arrow{top:-11px;font-size:16px;line-height:16px;width:20px;height:20px;margin-left:-10px;transform-origin:50% 33px}''',
'mobile arrow')

# --- Enhancements: route planner understands SEV as its own mode/color ---
enh=replace_once(enh,
'''    bus: { c: "#f6c900", fg: "#111", label: "BUS" },
    ferry: { c: "#0077a8", fg: "#fff", label: "F" },''',
'''    bus: { c: "#f6c900", fg: "#111", label: "BUS" },
    replacement: { c: "#c026d3", fg: "#fff", label: "SEV" },
    ferry: { c: "#0077a8", fg: "#fff", label: "F" },''',
'enh modeInfo replacement')

enh=replace_once(enh,
'''  function legProduct(leg) {
    if (leg?.walking) return "walking";
    const p = leg?.line?.product;
    return modeInfo[p] ? p : "regional";
  }''',
'''  function legProduct(leg) {
    if (leg?.walking) return "walking";
    const remarks = Array.isArray(leg?.remarks) ? leg.remarks.map(r => r?.text || r?.summary || r?.code || "").join(" ") : "";
    const text = [leg?.line?.name, leg?.line?.id, leg?.direction, leg?.destination?.name, remarks].filter(Boolean).join(" ").toUpperCase();
    if (/\\bSEV\\b|SCHIENENERSATZVERKEHR|ERSATZVERKEHR|ERSATZBUS/.test(text)) return "replacement";
    const p = leg?.line?.product;
    return modeInfo[p] ? p : "regional";
  }''',
'enh legProduct replacement')

enh=replace_once(enh,
'''  function modeCompatible(a, b) {
    if (!a || !b || a === b) return true;
    const railA = a === "regional" || a === "express";
    const railB = b === "regional" || b === "express";
    return railA && railB;
  }''',
'''  function modeCompatible(a, b) {
    if (!a || !b || a === b) return true;
    if ((a === "replacement" && b === "bus") || (a === "bus" && b === "replacement")) return true;
    const railA = a === "regional" || a === "express";
    const railB = b === "regional" || b === "express";
    return railA && railB;
  }''',
'enh mode compatibility')

# Keep enhancement CSS from inverting the new high-contrast direction badge on light maps.
enh=replace_once(enh,
'''    body.map-light .veh-arrow{color:#111!important;text-shadow:0 0 2px #fff,0 0 4px #fff,0 1px 2px #fff!important;filter:none!important}''',
'''    body.map-light .veh-arrow{color:#fff!important;background:rgba(5,10,18,.96)!important;border:2px solid #fff!important;text-shadow:none!important;filter:none!important}''',
'enh light arrow')

# Add explicit replacement sizing in enhancement CSS so it stays readable on mobile.
enh=replace_once(enh,
'''    .veh.kind-bus,.veh.kind-tram{min-width:46px!important;height:40px!important;padding:2px 5px 3px!important;border-radius:9px!important}''',
'''    .veh.kind-bus,.veh.kind-tram{min-width:46px!important;height:40px!important;padding:2px 5px 3px!important;border-radius:9px!important}
    .veh.kind-replacement{min-width:50px!important;height:40px!important;padding:2px 6px 3px!important;border-radius:9px!important;background:linear-gradient(135deg,#c026d3 0 72%,#7d168d 72% 100%)!important}''',
'enh replacement size')

enh=replace_once(enh,
'''    .kind-tram .veh-symbol::before{content:"TRAM"!important;font-size:8px!important;line-height:9px!important;font-weight:1000!important;letter-spacing:.04em!important}''',
'''    .kind-tram .veh-symbol::before{content:"TRAM"!important;font-size:8px!important;line-height:9px!important;font-weight:1000!important;letter-spacing:.04em!important}
    .kind-replacement .veh-symbol{font-size:10px!important;line-height:10px!important;min-height:11px!important;font-weight:1000!important;letter-spacing:.08em!important}''',
'enh replacement symbol')

enh=replace_once(enh,
'''      .veh.kind-bus,.veh.kind-tram{min-width:42px!important;height:36px!important}''',
'''      .veh.kind-bus,.veh.kind-tram{min-width:42px!important;height:36px!important}
      .veh.kind-replacement{min-width:46px!important;height:36px!important}''',
'enh mobile replacement')

# Assertions.
for token in ['replacement:{name:"Ersatzverkehr"','kind-replacement','ERSATZVERKEHR','title="Fahrtrichtung">↑</span>']:
    if token not in idx:
        raise SystemExit(f'missing index token {token}')
for token in ['replacement: { c: "#c026d3"','a === "replacement" && b === "bus"','ERSATZVERKEHR']:
    if token not in enh:
        raise SystemExit(f'missing enhancement token {token}')

idx_path.write_text(idx,encoding='utf-8')
enh_path.write_text(enh,encoding='utf-8')
