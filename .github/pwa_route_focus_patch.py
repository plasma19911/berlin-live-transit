from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFilter

root = Path('public')
index = root / 'index.html'
enh = root / 'enhancements.js'

# --- Route focus -------------------------------------------------------------
s = enh.read_text(encoding='utf-8')
marker = '  const routeState = { layers: [], controller: null };\n'
helper = '''  const routeState = { layers: [], controller: null };
  const routeFocusState = { active: false, paneDisplays: new Map() };

  function ensurePlannerPanes(map) {
    const panes = [
      ["plannerRouteHaloPane", "760"],
      ["plannerRoutePane", "770"],
      ["plannerStopPane", "780"]
    ];
    for (const [name, z] of panes) {
      if (!map.getPane(name)) map.createPane(name);
      const pane = map.getPane(name);
      pane.style.zIndex = z;
      pane.style.pointerEvents = "none";
    }
  }

  function setRouteFocus(active) {
    const map = window.__berlinLiveMap;
    if (!map) return;
    ensurePlannerPanes(map);
    const names = ["vehiclePane", "routeHaloPane", "routePane", "tripStopPane"];
    if (active && !routeFocusState.active) {
      routeFocusState.paneDisplays.clear();
      for (const name of names) {
        const pane = map.getPane(name);
        if (!pane) continue;
        routeFocusState.paneDisplays.set(name, pane.style.display || "");
        pane.style.display = "none";
      }
      routeFocusState.active = true;
      document.body.classList.add("planned-route-focus");
    } else if (!active && routeFocusState.active) {
      for (const name of names) {
        const pane = map.getPane(name);
        if (pane) pane.style.display = routeFocusState.paneDisplays.get(name) || "";
      }
      routeFocusState.paneDisplays.clear();
      routeFocusState.active = false;
      document.body.classList.remove("planned-route-focus");
    }
  }
'''
if 'const routeFocusState =' not in s:
    if marker not in s:
        raise SystemExit('routeState marker not found')
    s = s.replace(marker, helper, 1)

old_clear = '    routeState.layers = [];\n  }\n\n  function durationText(journey) {'
new_clear = '    routeState.layers = [];\n    setRouteFocus(false);\n  }\n\n  function durationText(journey) {'
if 'setRouteFocus(false);\n  }\n\n  function durationText' not in s:
    if old_clear not in s:
        raise SystemExit('clearPlannedRoute marker not found')
    s = s.replace(old_clear, new_clear, 1)

legs_marker = '      if (!legs.length) throw new Error("Keine Verbindung gefunden.");\n\n      const bounds = L.latLngBounds([]), layers = [];'
legs_repl = '      if (!legs.length) throw new Error("Keine Verbindung gefunden.");\n\n      setRouteFocus(true);\n      ensurePlannerPanes(map);\n      const bounds = L.latLngBounds([]), layers = [];'
if 'setRouteFocus(true);\n      ensurePlannerPanes(map);' not in s:
    if legs_marker not in s:
        raise SystemExit('planner success marker not found')
    s = s.replace(legs_marker, legs_repl, 1)

s = s.replace('pane: "routeHaloPane", color: "#071019"', 'pane: "plannerRouteHaloPane", color: "#071019"')
s = s.replace('pane: "routePane", color, weight: walking ? 3 : 6', 'pane: "plannerRoutePane", color, weight: walking ? 3 : 6')
s = s.replace('pane: "vehiclePane", icon: endpoint("A")', 'pane: "plannerStopPane", icon: endpoint("A")')
s = s.replace('pane: "vehiclePane", icon: endpoint("B")', 'pane: "plannerStopPane", icon: endpoint("B")')

catch_marker = '    } catch (error) {\n      if (error?.name === "AbortError") return;\n      console.error("Adress-Routing:", error);'
catch_repl = '    } catch (error) {\n      if (error?.name === "AbortError") return;\n      clearPlannedRoute();\n      console.error("Adress-Routing:", error);'
if 'clearPlannedRoute();\n      console.error("Adress-Routing:", error);' not in s:
    if catch_marker not in s:
        raise SystemExit('route catch marker not found')
    s = s.replace(catch_marker, catch_repl, 1)

enh.write_text(s, encoding='utf-8')

# --- PWA metadata ------------------------------------------------------------
h = index.read_text(encoding='utf-8')
pwa_head = '''<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
<link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png">
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Berlin Transit">'''
if 'rel="manifest" href="/manifest.webmanifest"' not in h:
    theme = '<meta name="theme-color" content="#090d14">'
    if theme not in h:
        raise SystemExit('theme-color marker not found')
    h = h.replace(theme, theme + '\n' + pwa_head, 1)

sw_register = '''
<script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(err => console.warn("Service Worker:", err));
  });
}
</script>
'''
if 'navigator.serviceWorker.register("/sw.js")' not in h:
    if '</body>' not in h:
        raise SystemExit('body end marker not found')
    h = h.replace('</body>', sw_register + '</body>', 1)
index.write_text(h, encoding='utf-8')

manifest = {
    "id": "/",
    "name": "Berlin Live Transit",
    "short_name": "Berlin Transit",
    "description": "Live-Karte für Bus, Tram, U-Bahn, S-Bahn und weitere Verkehrsmittel in Berlin.",
    "start_url": "/",
    "scope": "/",
    "display": "standalone",
    "background_color": "#090d14",
    "theme_color": "#090d14",
    "orientation": "any",
    "categories": ["travel", "navigation", "utilities"],
    "icons": [
        {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
    ]
}
(root / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(root / 'sw.js').write_text(
    'self.addEventListener("install", () => self.skipWaiting());\n'
    'self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));\n'
    'self.addEventListener("fetch", () => {});\n',
    encoding='utf-8'
)

# --- App icons ---------------------------------------------------------------
icon_dir = root / 'icons'
icon_dir.mkdir(exist_ok=True)

def make_icon(size, path, maskable=False):
    scale = 4
    S = size * scale
    img = Image.new('RGBA', (S, S), '#07111d')

    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gpad = int(S * (0.19 if maskable else 0.14))
    gd.ellipse((gpad, gpad, S-gpad, S-gpad), fill=(0, 168, 255, 95))
    glow = glow.filter(ImageFilter.GaussianBlur(int(S * 0.07)))
    img = Image.alpha_composite(img, glow)

    pad = int(S * (0.23 if maskable else 0.17))
    box = (pad, pad, S-pad, S-pad)
    radius = int(S * 0.16)
    mask = Image.new('L', (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle(box, radius=radius, fill=255)

    grad = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(grad)
    top = (25, 135, 255, 255)
    bottom = (35, 211, 255, 255)
    for y in range(S):
        t = y / max(1, S-1)
        c = tuple(round(top[i]*(1-t) + bottom[i]*t) for i in range(4))
        gdraw.line((0, y, S, y), fill=c)
    tile = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    tile = Image.composite(grad, tile, mask)
    img = Image.alpha_composite(img, tile)

    d = ImageDraw.Draw(img)
    cx = S / 2
    bolt = [
        (cx + S*0.015, S*0.305),
        (cx - S*0.145, S*0.535),
        (cx - S*0.035, S*0.535),
        (cx - S*0.085, S*0.700),
        (cx + S*0.160, S*0.435),
        (cx + S*0.045, S*0.435),
    ]
    d.polygon(bolt, fill=(255, 255, 255, 255))

    r = int(S * 0.018)
    for px, py, col in [
        (0.31, 0.72, (246, 201, 0, 255)),
        (0.69, 0.70, (0, 141, 76, 255)),
        (0.71, 0.31, (226, 0, 26, 255))
    ]:
        x, y = int(S*px), int(S*py)
        d.ellipse((x-r, y-r, x+r, y+r), fill=col, outline=(255,255,255,255), width=max(2, int(S*.006)))

    img = img.convert('RGB').resize((size, size), Image.Resampling.LANCZOS)
    img.save(path, 'PNG', optimize=True)

make_icon(192, icon_dir / 'icon-192.png')
make_icon(512, icon_dir / 'icon-512.png')
make_icon(512, icon_dir / 'icon-maskable-512.png', maskable=True)
make_icon(180, icon_dir / 'apple-touch-icon.png')

# Remove one-off patch machinery from final tree.
Path('.github/workflows/pwa-route-focus-v2.yml').unlink(missing_ok=True)
Path('.github/pwa_route_focus_patch.py').unlink(missing_ok=True)
