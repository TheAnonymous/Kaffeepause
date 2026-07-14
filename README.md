# Kaffeepause

Ein autonomes Pixel-Art-Diorama für eine kleine Pause im Browser.

**[Ort auswählen →](https://theanonymous.github.io/Kaffeepause/)**

## Über das Projekt

Kaffeepause beginnt mit einer Ortswahl: ein gemütliches Café, ein warmes Ramen-Restaurant oder eine ruhige Arcade-Halle. Alle drei Varianten teilen sich die autonome, kollisionsbewusste Gäste-Simulation, erhalten aber jeweils eigene Einrichtung, Palette, Theke, Lichtdetails und zurückhaltende Klangfarbe. Gerätezeit, Sonnenstand, Wetter und Tagesprofil verändern Außenwelt, Licht, Auslage, Geräuschkulisse und Belegung weich. Gäste kommen und gehen, bestellen, lesen, arbeiten, zeichnen, telefonieren, reden und trinken – vollständig selbstständig und ohne sichtbaren Schleifensprung. Wiederkehrende Stammgäste bringen ruhige Geschichten mit: Mara füllt und hängt eine Skizze auf, Noor und Toni verbringen einen ersten Abend miteinander, Linn verschenkt etwas Selbstgestricktes. Dazwischen verbinden kleine Alltagsmomente die Szene.

- vollständig prozedurale WebGL-Dioramen ohne fremde Spiel- oder Grafikassets
- Auswahl zwischen Café, Ramen-Restaurant und Arcade-Halle vor dem Eintritt; keine nachträgliche Menühürde
- echte 2304 × 1296-HD-Masterfläche (6×) mit 144 × 208 Pixel großen Original-Figurentexturen
- perspektivische 2,5D-Kamera, physische Raumkörper, Möbel, Fenster, Tür, Bodenkontakt und echte Tiefenverdeckung
- hochauflösende Gesichter, Haare, Stoffnähte, Hände, Schuhe, Accessoires und tätigkeitsgebundene Requisiten
- animierte Pixel-Sprechblasen mit venueabhängiger Pseudosprache, abwechselnden Gesprächsrunden und Tipp-Effekt
- separate HD-2D-Kompositionskette für Bloom, Farblicht, Miniatur-Fokus und Vignette
- zwölf deterministische Figuren-Silhouetten mit fünf Körperformen, vier Gesichtsformen, acht Frisuren, sechs Outfit-Schnitten, unterschiedlichen Größen, Hauttönen und persönlichen Details
- bis zu acht Gäste mit lesbaren Tätigkeiten, Wetteraccessoires und einer detaillierten animierten Bedienung
- eine echte Eingangstür, die sich für ankommende und gehende Gäste am Simulations-Eingang öffnet und ruhig wieder schließt
- ortsspezifische, simulationsgebundene Requisiten: Espressomaschine, Küchenpass, Arcade-Screens sowie belegte Tische und Warteschlangen
- neun Gasttätigkeiten, darunter Tagebuchschreiben, Stricken und Brettspiel; Barista mahlt, verkostet und bedient
- sanfte, deterministische Café-Momente mit eigenen Bild- und Klangdetails, die nicht mit Unfällen kollidieren
- vier visuell wiedererkennbare Stammgäste mit seltenen, zusammenhängenden Mini-Geschichten
- funktionierende Pixel-Wanduhr sowie lokaler Sonnenstand mit Dämmerung und Polarzuständen
- klare, bewölkte, neblige, regnerische, verschneite und stürmische Außenwelten
- räumliche Stadtsilhouette, Wetterpartikel und Stadtlichter hinter einer echten Glasscheibe
- tageszeitabhängiges, gerichtetes Sonnenlicht, Nebel, nasse Lichtstimmung und warme praktische Innenbeleuchtung
- mehrschichtige Vordergrundrequisiten, ortsspezifische Lichtspuren auf dem Boden und ruhige Innenreflexionen im Fensterglas
- leuchtende HD-2D-Diorama-Inszenierung mit Lichtblüten, Tiefendunst, Fokuszone und sanfter Vignette
- deterministische Figuren-Zustandsautomaten und zentrale Platzreservierung
- kollisionsbewusste Routen um Theke, Tische und andere laufende Gäste
- zentrales Proportionsmodell mit automatischen Prüfungen für Figuren, Tische, Theke, Tür, Tiefenstaffelung und freie Laufwege
- schlanke Szenenlaufzeit mit unveränderlichen Snapshots zwischen Simulation und WebGL-Renderer
- seltene, vollständig reversible Café-Unfälle mit Tablett, Kaffeetasse oder Regenschirm
- adaptive Lo-fi-Musik, räumlicher Regen und Wind sowie seltene, belegungsabhängige Ortsgeräusche über Web Audio
- pixelartige Ton- und Vollbildsteuerung, die sich nach 2,5 Sekunden Ruhe zurückzieht
- langsame Kamerafahrt auf schmalen Smartphone-Displays
- Reduced-Motion-Modus mit ruhiger Kamera, statischem Wetter und weniger Partikeln
- rein clientseitig und ohne eigenes Backend

Nach dem Betreten lassen Mausbewegung, Berührung, Tastatur oder Fokus die Steuerung sofort wieder erscheinen. Im Vollbild bleibt ihr Zustand auch nach Escape korrekt synchronisiert. Alle vier bis sieben Minuten sorgt ein harmloser Slapstick-Moment kurz für Aufregung; danach setzen Barista und Gäste ihre gesicherten Tätigkeiten und Wege fort.

## Standort und Wetter

Beim Laden fragt Kaffeepause nach dem Browserstandort. Die Koordinaten bleiben ausschließlich im Arbeitsspeicher, werden für den Wetterabruf auf zwei Dezimalstellen gerundet und weder gespeichert noch rückwärts geokodiert. Bei Ablehnung, ungültigen Daten oder fehlendem Netz läuft das Café ohne Einschränkung mit einer deterministischen Ersatzumgebung weiter.

Live-Wetter stammt aus der keylosen [Open‑Meteo Forecast API](https://open-meteo.com/en/docs) und wird höchstens alle 15 Minuten aktualisiert. Die sichtbare Attribution im Café verweist auf [Open‑Meteo](https://open-meteo.com/); das Projekt nutzt dessen nichtkommerzielles Modell. Zeit, Standort und Wetter werden nicht an ein eigenes Backend übertragen.

## Lokal starten

```sh
npm install
npm run dev
```

## Prüfungen

```sh
npm test
npm run build
npm run test:e2e
```

Die Simulation verwendet weiterhin stabile Szenenkoordinaten von 384 × 216. Der neue Renderer übersetzt sie in einen 16 × 8,8 × 7,2 Einheiten großen Raumkörper und rendert ihn auf einer intrinsischen 2304 × 1296-HD-Masterfläche. Figuren bleiben hochauflösende Pixelkunst, stehen aber als Billboards zwischen echten 3D-Möbeln. Dadurch entstehen perspektivisch korrekte Verdeckungen, Bodenschatten und eine Miniatur-Fokuszone. Auf Smartphones wandert dieselbe Perspektivkamera durch das Diorama.

Tragende Simulationsmaße liegen in `src/scene/proportions.ts`, die physische Maßkette des Dioramas in `src/diorama/types.ts`. Die automatische Prüfung vergleicht Beziehungen wie Tisch zu Figur, Theke zu Personal, Tür zu Körperhöhe, Sitz- zu Stehhöhe, Texturauflösung und freie Laufwege. Der Canvas veröffentlicht die Ergebnisse zusätzlich über `data-proportion-check`, `data-diorama-scale-check` und `data-layout-score`.

Im Entwicklungsserver lassen sich visuelle Szenen mit `?time=HH:MM`, `?weather=clear|cloudy|fog|rain|snow|storm`, `?lat=<Breite>` und `?lon=<Länge>` kombinieren. Genau eine Unfallart kann zusätzlich beschleunigt werden, zum Beispiel mit `?accident=tray-drop`, `?accident=coffee-spill` oder `?accident=umbrella-pop`; ebenso ein Alltagsmoment mit `?moment=shared-cake|card-game|window-gaze|sketch-reveal` oder eine Stammgast-Geschichte mit `?story=sketchbook|first-date|knit-gift`. Produktionsbuilds ignorieren sämtliche Testparameter.
