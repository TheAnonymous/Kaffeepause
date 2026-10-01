# Entwicklung

## Aufbau

- `src/app.ts` verbindet Oberfläche, Simulation, Umgebung, Audio und Renderer.
- `src/simulation/` enthält die Gäste-Simulation: Grundrisse (`layout.ts`), Wegfindung, Momente, Geschichten und Unfälle (`cafeSimulation.ts`).
- `src/environment/` berechnet Tageszeit, Sonnenstand und Wetter.
- `src/diorama/` enthält den WebGL-Renderer (`DioramaRenderer.ts`), den Raumaufbau (`venueBuilder.ts`), Figuren, Sprechblasen und die Nachbearbeitung (`fixedRenderPipeline.ts`).
- `src/audio*.ts` erzeugen Musik und Raumklang über Web Audio.

Die Simulation rechnet in Szenenkoordinaten von 384 × 216. Der Renderer übersetzt sie in einen Raum von 16 × 8,8 × 7,2 Einheiten; Figuren sind Pixel-Billboards zwischen echten 3D-Möbeln. Tragende Maße stehen in `src/scene/proportions.ts` und `src/diorama/types.ts`.

## Figuren

Gäste, Bedienung und Mochi sind Klötzchen-Figuren (`voxelFigure.ts`, `cafeCat.ts`). Jede Figur ist ein einziges Skelett-Modell (`VoxelRig` in `voxelKit.ts`): Die Quader sind farbige Kästen, die Gelenke sind Knochen. Mundformen, Gegenstände und Mochis Herz werden über die Skalierung ihres Knochens ein- und ausgeblendet. So braucht eine Figur zwei Zeichenaufrufe (Bild und Schatten); `e2e/cafe.spec.ts` prüft, dass ein voll besetzter Ort unter 240 Aufrufen pro Bild bleibt. Ein Lichtrand im Material (`figureMaterial()`) hebt Figuren nachts ab und lässt die Beteiligten einer Geschichte schimmern. Aussehen, Frisur, Kleidung, Brille, Bart und Zubehör kommen aus denselben Daten wie in der Simulation (`GuestAppearance`, `GuestPalette`).

Alle Gelenke, die Körperhöhe und die Blickrichtung folgen ihrer Zielhaltung weich (`settle()` in `voxelFigure.ts`); beim Hinsetzen klingt zusätzlich der Sprung auf die Sitzmitte ab. Auf Standbildern (kein Zeitfortschritt) wird nicht geglättet. Die Figuren drehen sich wirklich im Raum: Laufende schauen in Laufrichtung, Sitzende von vorn (Bank, Lounge), zum Tisch (Tischende, Kopf leicht zur Kamera) oder zur Theke (Ramen). Arme mit Ellbogen halten die Gegenstände der Tätigkeit, dazu kommen Atmen, Blinzeln, Gesichtsausdrücke und die Gesten aus Momenten und Reaktionen. Maße und Sitzhöhen stehen in `characters.ts`; sitzende Gäste sitzen auf der Sitzfläche ihres Möbels (`seatBindings`).

Wo eine Gast-Figur gezeichnet wird und wohin sie sich dreht, entscheidet `figureMotion.ts` (Darstellung und Tests nutzen dasselbe): Der Körper eines Sitzenden folgt immer dem Stuhl, nie der Blickrichtung einer Reaktion oder Geschichte, sonst dreht er sich in die Lehne. Auf den letzten Schritten zum Platz dreht sich der Gast schon zum Stuhl, und nach dem Aufstehen bleibt er noch ein Stück zum Stuhl gedreht. Springt die Simulation die Bedienung an einen anderen Platz (Szenen an der Theke), läuft sie in der Darstellung hinüber.

`tests/sweep.test.ts` spielt pro Ort 15 Minuten Szenenzeit durch (mit Geschichten, Missgeschicken und einer Maus, die Gäste zufällig zur Seite wendet) und vermisst jedes Bild: Stehen Gehende in Möbeln oder Sitzenden? Drehen sich Sitzende in die Lehne? Springt die Bedienung? Das Prüfgerüst steht in `tests/support/sweep.ts`; neue Fehler lassen sich dort als weitere Messung ergänzen. Die Laufwege weichen leeren Stühlen und Hockern aus (`planRoute` in `cafeSimulation.ts`), und Abstände zwischen Figuren zählen in Diorama-Einheiten, weil ein Pixel des Grundrisses in der Tiefe doppelt so lang ist wie in der Breite (`worldDistance` in `layout.ts`).

Die Eingangstür beschreibt `doorSpec()` in `venueBuilder.ts`: Scharnier an einer Zarge der Wandöffnung, Schwenk nach innen. `doorShouldBeOpen()` hält sie offen, solange jemand ein- oder ausgeht oder sich im Schwenkbereich bewegt. `tests/door.test.ts` prüft den ganzen Schwenk gegen Wände, Möbel, Sitzplätze und den Laufweg.

Tische werden aus den Tischflächen in `src/simulation/layout.ts` gebaut. Wer einen Tisch verschiebt oder vergrößert, ändert also Simulation und Bild zugleich.

## Anklicken

Ein Klick ins Diorama geht an `handleClick()` im Renderer: Gäste und Bedienung winken sofort zurück, Mochi kommt vor die Fensterbank und schnurrt (`CafeCat.summon()`), die Klingel auf der Theke (`COUNTER_BELLS`) ruft die Bedienung zur Ausgabe (`CafeSimulation.callBarista()`). Kleine Ziele wie Mochi und die Klingel haben Vorrang vor Figuren in der Nähe. Im Testmodus stehen ihre Bildschirmpositionen in `data-click-targets`, Zeichenaufrufe und Dreiecke in `data-draw-calls` und `data-triangles`.

## Fenster und Draußen

Jeder Ort hat ein Fenster in der Rückwand (`VENUE_WINDOWS` in `venueBuilder.ts`): das große Café-Fenster, ein Fenster mit Holzgitter im Ramen-Restaurant und ein Neon-gerahmtes Fenster in der Arcade. Dahinter liegen Himmel und Häuser, die selbst leuchten und der Tageszeit folgen; sie nehmen kaum Raumlicht an, sonst würden die Lampen sie nachts durch die Wand aufhellen. Regen und Schnee fallen nur hinter dem Fenster des aktuellen Ortes. Hinter den Seitentüren von Café und Ramen-Restaurant liegt eine Häuserzeile, die man sieht, wenn die Tür offen steht.

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
| `?quality=master\|balanced\|fallback` | Qualitätsstufe erzwingen |
| `?testRender=diagnostic` | Frames nur auf Anfrage zeichnen (für Tests) |

Unabhängig davon wählt `#cafe`, `#ramen` oder `#arcade` in der Adresse den Ort vor; das gilt auch im fertigen Build.

Mit `testRender=diagnostic` stehen im Fenster `stepDioramaDiagnosticFrame(sekunden)` und `renderDioramaVisualFrame()` bereit; die Browser-Tests in `e2e/helpers.ts` nutzen sie, um Szenen reproduzierbar vorzuspulen. In diesem Modus erscheint auch der Mitmach-Tipp nicht.

Der Tipp („Probier mal: Mochi, die Klingel und die Gäste reagieren auf dich.“) kommt einmalig nach 40 Sekunden, wenn bis dahin nichts angeklickt wurde. Ob er schon gezeigt wurde, merkt sich der Browser unter `kaffeepause-tipp-gesehen` im `localStorage`; zum Wiedersehen den Eintrag löschen.

Für Chat-Vorschau und Startbildschirm liegen `vorschau.jpg` (1200×630, aus `look/cafe-tag.png`), `icon-*.png` (aus `favicon.svg`) und `manifest.webmanifest` in `public/`. Das Symbol, eine Tasse aus Klötzchen, zeichnet `scripts/make-icon.py` als `favicon.svg`; die PNGs entstehen daraus:

```sh
python3 scripts/make-icon.py
for s in 180 192 512; do magick -background '#241923' -density 1200 public/favicon.svg -resize ${s}x${s} -alpha remove -alpha off -depth 8 public/icon-$s.png; done
```

Die Vorschau lässt sich nach größeren Änderungen am Café neu schneiden:

```sh
magick look/cafe-tag.png -gravity center -crop 1440x756+0+0 +repage -resize 1200x630 -quality 90 public/vorschau.jpg
```

Der Canvas veröffentlicht nur noch die `data-*`-Attribute, die Tests oder die App selbst lesen, etwa `data-renderer-state`, `data-art-assets`, `data-venue`, `data-guest-count`, `data-moment`, `data-story`, `data-accident` und `data-camera-focus-source`.

## Veröffentlichen

`npm run release` führt `npm run check` aus, fragt nach und lädt `dist/` per SSH auf den Server (`/srv/www/kaffeepause.jodie-oesterling.de/releases/<Zeitstempel>`). Danach zeigt `current` atomar auf das neue Release und `previous` auf das alte. `npm run release -- --rollback` tauscht zurück. Der Server-Teil steht in `scripts/release-switch.sh`: Nach dem Umschalten bleiben nur die fünf neuesten Releases liegen; worauf `current` oder `previous` zeigt, wird nie gelöscht.
