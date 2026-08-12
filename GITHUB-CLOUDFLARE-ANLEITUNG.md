# Berlin Live Transit – GitHub + Cloudflare Pages Anleitung

Diese Version soll **über HTTPS** laufen und nicht mehr als lokale `file://`-Datei.

## Richtige Projektstruktur

```text
berlin-live-transit/
├─ public/
│  └─ index.html
├─ functions/
│  └─ api/
│     ├─ radar.js
│     ├─ radar-berlin.js
│     └─ trip.js
├─ README.md
├─ GITHUB-CLOUDFLARE-ANLEITUNG.md
└─ wrangler.toml
```

`functions/` muss im Hauptordner liegen, **nicht** in `public/`.

---

## 1. ZIP entpacken

Entpacke `berlin-live-map-github-ready.zip`.

Danach musst du direkt `public`, `functions`, `README.md` usw. sehen.

---

## 2. GitHub-Repository erstellen

1. Auf GitHub anmelden.
2. Oben rechts **+** → **New repository**.
3. Name: `berlin-live-transit`
4. Public oder Private auswählen.
5. **Create repository**.

---

## 3. Projektdateien auf GitHub hochladen

Im neuen Repository:

1. **Add file**
2. **Upload files**
3. Den **Inhalt des entpackten Ordners** hineinziehen.
4. Prüfen, dass GitHub diese Pfade zeigt:

```text
public/index.html
functions/api/radar.js
functions/api/radar-berlin.js
functions/api/trip.js
README.md
wrangler.toml
```

5. Commit message:
   `Initial Berlin Live Transit`
6. **Commit changes**

Wichtig: Nicht nur die ZIP-Datei hochladen.

---

## 4. Cloudflare Pages mit GitHub verbinden

1. Cloudflare Dashboard öffnen.
2. **Workers & Pages**
3. **Create application**
4. **Pages**
5. **Import an existing Git repository** / **Connect to Git**
6. GitHub verbinden.
7. Repository `berlin-live-transit` auswählen.

---

## 5. Cloudflare Build-Einstellungen

```text
Production branch: main
Framework preset: None
Build command: exit 0
Build output directory: public
Root directory: leer
```

Keine Environment Variables nötig.

Dann **Save and Deploy**.

---

## 6. Live-Adresse öffnen

Nach erfolgreichem Deployment erhältst du z. B.:

```text
https://berlin-live-transit.pages.dev
```

Nur noch diese HTTPS-Adresse verwenden.

---

## 7. Server-Radar testen

Öffne:

```text
https://DEINE-DOMAIN.pages.dev/api/radar-berlin
```

Erwartet wird JSON mit:

```json
{
  "movements": [],
  "meta": {
    "tiles_ok": 12,
    "tiles_total": 12,
    "vehicles_raw_unique": 1000,
    "coverage": "Berlin",
    "partial": false
  }
}
```

Ideal:

```text
tiles_ok = 12
tiles_total = 12
```

Dann wurden alle 12 Berlin-Teilbereiche erfolgreich abgefragt.

---

## 8. Was die Karte lädt

Der Browser macht nur **eine** Anfrage an:

```text
/api/radar-berlin
```

Die Cloudflare-Funktion fragt serverseitig 12 kleinere Berlin-Bereiche ab, vereinigt die Fahrzeuge und entfernt Duplikate.

Dadurch gibt es im Browser nicht mehr das alte `1/4`-Problem.

Angezeigt werden nur bekannte Kategorien:

- S-Bahn
- U-Bahn
- Bus
- Tram
- Fähre
- Regionalverkehr
- Fernverkehr

`Sonstige` wird nicht mehr angezeigt.

---

## 9. Fahrzeugdetails

Beim Klick auf ein Fahrzeug verwendet die Seite:

```text
/api/trip?id=TRIP_ID
```

Damit werden – falls die Datenquelle sie liefert – angezeigt:

- Ziel
- Fahrtrichtung
- Verspätung
- nächste Haltestellen
- Zeiten
- Verspätungen pro Halt
- Linienverlauf

---

## 10. Standort am Handy

Die `https://...pages.dev`-Adresse in Safari oder Chrome öffnen.

Dann auf **Mein Standort** tippen und Standort erlauben.

Lokale `file://`-Dateien dafür nicht mehr verwenden.

---

## 11. Spätere Updates

Wenn du etwas änderst:

1. Datei auf GitHub ändern/ersetzen.
2. **Commit changes**.
3. Cloudflare erkennt den Commit automatisch.
4. Ein neues Deployment wird erstellt.

---

## Fehler

### `/api/radar-berlin` → 404

Prüfe:

```text
functions/api/radar-berlin.js
```

`functions/` muss im Repository-Hauptordner liegen.

### Webseite → 404

Prüfe:

```text
public/index.html
```

und:

```text
Build output directory = public
```

### Nur z. B. `11/12`

Eine der 12 Upstream-Abfragen ist temporär fehlgeschlagen. Die anderen 11 Bereiche werden weiterhin angezeigt.

### `12/12`, aber weniger Fahrzeuge als erwartet

Die Karte kann nur Fahrzeuge anzeigen, die VBB/BVG im Radar tatsächlich zurückgeben. Sie erfindet keine Positionen.


## Detailansicht

Beim Klick auf ein Fahrzeug zeigt die App Linienverlauf, nächste Haltestellen, Soll-/Ist-Zeiten, Verspätung pro Halt und – falls vorhanden – Steig/Gleis.
