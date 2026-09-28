# Entwicklung

## Aufbau

- `src/app.ts` verbindet Oberfläche, Simulation, Umgebung, Audio und Renderer.
- `src/simulation/` enthält die Gäste-Simulation: Grundrisse (`layout.ts`), Wegfindung, Momente, Geschichten und Unfälle (`cafeSimulation.ts`).
- `src/environment/` berechnet Tageszeit, Sonnenstand und Wetter.
- `src/diorama/` enthält den WebGL-Renderer (`DioramaRenderer.ts`), den Raumaufbau (`venueBuilder.ts`), Figuren, Sprechblasen und die Nachbearbeitung (`fixedRenderPipeline.ts`).
- `src/audio*.ts` erzeugen Musik und Raumklang über Web Audio.

Die Simulation rechnet in Szenenkoordinaten von 384 × 216. Der Renderer übersetzt sie in einen Raum von 16 × 8,8 × 7,2 Einheiten; Figuren sind Pixel-Billboards zwischen echten 3D-Möbeln. Tragende Maße stehen in `src/scene/proportions.ts` und `src/diorama/types.ts`.

## Figuren

Figuren sind Pixel-Sprites (144 × 208) auf senkrechten Tafeln, die sich nur um die Hochachse zur Kamera drehen. Alle Figuren nutzen denselben Maßstab: Die Schuhzeile `SPRITE_FLOOR_ROW` steht genau auf der Bodenoberkante (`FLOOR_SURFACE_Y`), und eine stehende Figur ist `DIORAMA.standingHeight` hoch. Sitzende Gäste werden auf die Sitzfläche ihres Möbels gesetzt (`seatBindings`) und je nach Platz von vorn (Bank, Lounge), im Profil (Tischende) oder von hinten (Ramen-Theke) gezeichnet. Die Hüfte liegt dabei auf der Sitzhöhe aus `SEAT_TOP_HEIGHT` in `spriteFactory.ts`.

Gezeichnet wird auf voller Auflösung, danach bekommt jede Figur eine leichte zylindrische Schattierung (`applyVolumeShading`) und wird auf halbe Auflösung vergröbert, bevor die Kontur entsteht. Die Tafeln werfen echte Schatten; die Form schneidet der `alphaTest` aus.

Die Eingangstür beschreibt `doorSpec()` in `venueBuilder.ts`: Scharnier an einer Zarge der Wandöffnung, Schwenk nach innen. `doorShouldBeOpen()` hält sie offen, solange jemand ein- oder ausgeht oder sich im Schwenkbereich bewegt. `tests/door.test.ts` prüft den ganzen Schwenk gegen Wände, Möbel, Sitzplätze und den Laufweg.

Tische werden aus den Tischflächen in `src/simulation/layout.ts` gebaut. Wer einen Tisch verschiebt oder vergrößert, ändert also Simulation und Bild zugleich.

## Licht und Farbe

Die Szene wird zuerst linear in einen Zwischenpuffer gerendert. Erst der letzte Schritt in `fixedRenderPipeline.ts` wendet Belichtung, Tone-Mapping und die sRGB-Umrechnung an (`#include <tonemapping_fragment>` und `#include <colorspace_fragment>`). Fehlen diese beiden Zeilen, wird das Bild deutlich zu dunkel und zu satt.

Helligkeit, Lampen und Aufhellung pro Ort und Tageszeit stehen in `src/diorama/look.ts` und `src/diorama/visualProfiles.ts`. Nach Änderungen dort zeigt `npx playwright test e2e/look.spec.ts` das Ergebnis als Bilder in `look/` und prüft Mindesthelligkeit und Kontrast.

## Testparameter

Nur im Entwicklungsserver (`npm run dev`); Produktionsbuilds ignorieren sie.

| Parameter | Wirkung |
| --- | --- |
| `?time=HH:MM` | feste Uhrzeit |
| `?weather=clear\|cloudy\|fog\|rain\|snow\|storm` | festes Wetter |
| `?lat=…&lon=…` | fester Standort |
| `?accident=tray-drop\|coffee-spill\|umbrella-pop` | Unfall sofort auslösen |
| `?moment=<Art>` | Moment sofort auslösen, z. B. `shared-cake`, `ramen-slurp`, `ticket-stream` |
| `?story=<Art>` | Stammgast-Geschichte starten, z. B. `sketchbook`, `order-mixup`, `noodle-mishap`, `glitched-coop` |
| `?livingSequence=cafe-window-to-pastry\|ramen-counter-water\|arcade-token-lane` | eine der drei Laufwege-Sequenzen bevorzugen |
| `?cinematicScale=<0.02–1>` | Kamerafolgen beschleunigen |
| `?cinematicShot=establishing\|detail\|reaction` | eine Einstellung einfrieren |
| `?art=fallback` | ohne Grafikatlanten rendern |
| `?atmosphere=<Welle>&atmospherePhase=fade-in\|hold\|fade-out&atmosphereScale=<Faktor>` | Außenwellen reproduzierbar zeigen |
| `?friends=demo` | vier Beispiel-Freunde vorbeikommen lassen |
| `?season=halloween\|winter-lights\|none` | Jahreszeiten-Deko unabhängig vom Datum zeigen |
| `?figures=voxel` | Probe: Figuren aus 3D-Klötzchen statt Pixel-Sprites |
| `?quality=master\|balanced\|fallback` | Qualitätsstufe erzwingen |
| `?testRender=diagnostic` | Frames nur auf Anfrage zeichnen (für Tests) |

Unabhängig davon wählt `#cafe`, `#ramen` oder `#arcade` in der Adresse den Ort vor; das gilt auch im fertigen Build.

Mit `testRender=diagnostic` stehen im Fenster `stepDioramaDiagnosticFrame(sekunden)` und `renderDioramaVisualFrame()` bereit; die Browser-Tests in `e2e/helpers.ts` nutzen sie, um Szenen reproduzierbar vorzuspulen.

Der Canvas veröffentlicht nur noch die `data-*`-Attribute, die Tests oder die App selbst lesen, etwa `data-renderer-state`, `data-art-assets`, `data-venue`, `data-guest-count`, `data-moment`, `data-story`, `data-accident` und `data-camera-focus-source`.

## Veröffentlichen

`npm run release` führt `npm run check` aus, fragt nach und lädt `dist/` per SSH auf den Server (`/srv/www/kaffeepause.jodie-oesterling.de/releases/<Zeitstempel>`). Danach zeigt `current` atomar auf das neue Release und `previous` auf das alte. `npm run release -- --rollback` tauscht zurück. Alte Releases bleiben liegen und müssen bei Bedarf von Hand gelöscht werden.
