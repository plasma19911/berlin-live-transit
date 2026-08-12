# Berlin Live Transit Map – Cloudflare Pages

Diese Version löst das Browser/CORS-Problem über einen Same-Origin-Proxy:

- `public/index.html` = Karte
- `functions/api/radar.js` = Server-Funktion für `/api/radar`
- Browser → `/api/radar`
- Server → VBB/BVG Radar

## Cloudflare Pages veröffentlichen

1. Ordner in ein GitHub-Repository hochladen.
2. In Cloudflare: **Workers & Pages → Create application → Pages → Connect to Git**.
3. Repository auswählen.
4. Build command: `exit 0`
5. Build output directory: `public`
6. Deploy.

Danach erhältst du eine HTTPS-Adresse wie `https://dein-projekt.pages.dev`.

Wichtig: Die `functions`-Mappe muss im Repository auf oberster Ebene liegen, nicht innerhalb von `public`.

## Test

Nach dem Deployment:

- `https://DEINE-DOMAIN/api/radar?north=52.52411&west=13.41002&south=52.51942&east=13.41709&results=10`

sollte JSON zurückgeben.


## V2 Detaildaten

Zusätzlich zu `/api/radar` gibt es jetzt:

- `/api/trip?id=TRIP_ID`

Der Proxy ruft serverseitig `/trips/:id?stopovers=true&remarks=true&polyline=true` auf.

Beim Klick auf ein Fahrzeug zeigt die Karte:
- Ziel/Richtung
- Fahrtrichtung
- aktuelle Verspätung
- nächste 10 Haltestellen
- Soll-/Ist-Zeiten soweit verfügbar
- Verspätung je Halt
- Linienverlauf auf der Karte
- markierte nächste Haltestellen


## Deployment

Siehe `GITHUB-CLOUDFLARE-ANLEITUNG.md`.
