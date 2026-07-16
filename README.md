# Kaffeepause

Ein autonomes Pixel-Art-Diorama für eine kleine Pause im Browser.

**[Ort auswählen →](https://theanonymous.github.io/Kaffeepause/)**

## Über das Projekt

Kaffeepause beginnt mit einer Ortswahl: ein gemütliches Café, ein warmes Ramen-Restaurant oder eine ruhige Arcade-Halle. Alle drei Varianten teilen sich die autonome, kollisionsbewusste Gäste-Simulation, besitzen aber eigenständige Grundrisse mit eigenen Eingängen, Laufwegen, Aufenthaltsplätzen, Möbeln, Lichtdetails und zurückhaltender Klangfarbe. Gerätezeit, Sonnenstand, Wetter und Tagesprofil verändern Außenwelt, Licht, Auslage, Geräuschkulisse und Belegung weich. Gäste kommen und gehen, bestellen, lesen, arbeiten, zeichnen, telefonieren, reden und trinken – vollständig selbstständig und ohne sichtbaren Schleifensprung. Zwölf venuegebundene Stammgäste bringen ruhige und verspielte Geschichten mit, von Maras Skizzenbuch bis zu einer vertauschten Bestellung, einer widerspenstigen Nudel und einem unerwarteten Co-op-Sieg. Dazwischen verbinden kleine Alltagsmomente die Szene.

- hybride WebGL-Dioramen aus eigenen Pixelatlanten und einer jederzeit verfügbaren prozeduralen Ersatzdarstellung
- Auswahl zwischen Café, Ramen-Restaurant und Arcade-Halle vor dem Eintritt; keine nachträgliche Menühürde
- echte 2304 × 1296-HD-Masterfläche (6×) mit 144 × 208 Pixel großen Original-Figurentexturen
- perspektivische 2,5D-Kamera, physische Raumkörper, Möbel, Fenster, Tür, Bodenkontakt und echte Tiefenverdeckung
- hochauflösende Gesichter, Haare, Stoffnähte, Hände, Schuhe, Accessoires und tätigkeitsgebundene Requisiten
- kompakte Pixel-Sprechblasen mit 15 gezeichneten Symbol-Emotes, semantischen 0,85-Sekunden-Folgen und statischer Reduced-Motion-Ansicht
- separate HD-2D-Kompositionskette für Bloom, Farblicht, Miniatur-Fokus und Vignette
- zwölf deterministische Figuren-Silhouetten mit fünf Körperformen, vier Gesichtsformen, acht Frisuren, sechs Outfit-Schnitten, unterschiedlichen Größen, Hauttönen und persönlichen Details
- vier bis sieben Gäste innerhalb der ortsspezifischen Kapazität, mit lesbaren Tätigkeiten, Wetteraccessoires und einer detaillierten animierten Bedienung
- drei echte Eingänge: links im Café, rechts im Ramen-Restaurant und mittig im rückwärtigen Arcade-Gang
- eigene Aktivitätslogik für Café-Fensterbank und Paartische, fünf Ramen-Thekenhocker sowie sechs stehende Arcade-Automatenplätze und eine Lounge
- ortsspezifische, simulationsgebundene Requisiten: Espressomaschine, Küchenpass, Arcade-Screens sowie belegte Tische und Warteschlangen
- neun Gasttätigkeiten, darunter Tagebuchschreiben, Stricken und Brettspiel; Barista mahlt, verkostet und bedient
- sanfte, deterministische Café-Momente mit eigenen Bild- und Klangdetails, die nicht mit Unfällen kollidieren
- zwölf venuegebundene Stammgäste und sieben seltene, zusammenhängende Mini-Geschichten
- vier lesbare Animationsposen für Gehen, Warten, Bestellen, neun Gasttätigkeiten und sieben Barista-Aufgaben
- registrierte Drei-Shot-Sequenzen aus Establishing, Detail und Reaktion für alle 18 Momente, mit exakter Rückkehrkamera und statischer Reduced-Motion-Übersicht
- asynchron geladene, ortsweise freigegebene Art-Packs für Oberflächen, Requisiten, Emission und sechs gemeinsame Figurenposen
- sanfter räumlicher Ereignisfokus mit priorisierter Kameraregie, 10-%-Safe-Frame und gezielt abblendenden Sichtblockern
- rein dekorative Mausnähe-Reaktionen mit Blickkontakt, Geste, Emote und sehr leisem venueabhängigem Akzent
- funktionierende Pixel-Wanduhr sowie lokaler Sonnenstand mit Dämmerung und Polarzuständen
- klare, bewölkte, neblige, regnerische, verschneite und stürmische Außenwelten
- räumliche Stadtsilhouette, Wetterpartikel und Stadtlichter hinter einer echten Glasscheibe
- reproduzierbare Atmosphärenwellen aus Passanten, Verkehrsschein, Wetter- und Lichtwechseln sowie einer eigenen Café-, Ramen- und Arcade-Signatur
- vier ortsweise nachgeladene V5-Pixelatlanten mit voneinander unabhängigen, prozeduralen Ebenen-Fallbacks
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
npm run verify:budgets
npm run test:e2e
npm run test:production
```

Die Simulation verwendet weiterhin stabile Szenenkoordinaten von 384 × 216. Der neue Renderer übersetzt sie in einen 16 × 8,8 × 7,2 Einheiten großen Raumkörper und rendert ihn auf einer intrinsischen 2304 × 1296-HD-Masterfläche. Figuren bleiben hochauflösende Pixelkunst, stehen aber als Billboards zwischen echten 3D-Möbeln. Dadurch entstehen perspektivisch korrekte Verdeckungen, Bodenschatten und eine Miniatur-Fokuszone. Auf Smartphones wandert dieselbe Perspektivkamera durch das Diorama.

Die gemeinsame Grundriss-Registry liegt in `src/simulation/layout.ts`, tragende Simulationsmaße in `src/scene/proportions.ts` und die physische Maßkette des Dioramas in `src/diorama/types.ts`. Die automatische Prüfung vergleicht Beziehungen wie Tisch zu Figur, Theke zu Personal, Tür zu Körperhöhe, Sitz- zu Stehhöhe, Sitzrichtung, Rückenlehnenlage, Texturauflösung und freie Laufwege. Der Canvas veröffentlicht die Ergebnisse zusätzlich über `data-proportion-check`, `data-diorama-scale-check`, `data-layout-score`, `data-venue-layout`, `data-entry-flow`, `data-layout-capacity`, `data-seat-alignment`, `data-seat-bindings` und die belegten Aktivitätsplätze.

Im Entwicklungsserver lassen sich visuelle Szenen mit `?time=HH:MM`, `?weather=clear|cloudy|fog|rain|snow|storm`, `?lat=<Breite>` und `?lon=<Länge>` kombinieren. Genau eine Unfallart kann zusätzlich beschleunigt werden, zum Beispiel mit `?accident=tray-drop`, `?accident=coffee-spill` oder `?accident=umbrella-pop`. `?moment=` akzeptiert neben den bestehenden Szenen auch `foam-moustache`, `sugar-packet-domino`, `steam-glasses`, `chopstick-drop`, `ticket-stream` und `button-mash-sync`; `?story=` zusätzlich `order-mixup`, `noodle-mishap` und `glitched-coop`. `?cinematicScale=` beschleunigt nur für visuelle Tests die Shot-Uhr, `?cinematicShot=establishing|detail|reaction` friert einen Shot in seinem Hold ein und `?art=fallback` erzwingt den prozeduralen Grafikpfad. Mit `?atmosphere=<Wellenart>`, `?atmospherePhase=fade-in|hold|fade-out` und `?atmosphereScale=<Faktor>` lassen sich die V5-Wellen reproduzierbar prüfen. Produktionsbuilds ignorieren sämtliche Testparameter.

Für Browserdiagnosen veröffentlicht der Canvas zusätzlich den aktiven Shot und Sequenzfortschritt (`data-shot-beat`, `data-camera-sequence`), den Zustand des Orts- und Atmosphärenpakets (`data-art-assets`, `data-art-pack`, `data-atmosphere-assets`) sowie Draw Calls, Dreiecke, Geometrien, GPU-Texturen und geschätzte Texturbytes (`data-draw-calls`, `data-triangles`, `data-geometries`, `data-gpu-textures`, `data-estimated-texture-bytes`). Die aktive Welle steht in `data-atmosphere-wave`, `data-atmosphere-phase`, `data-atmosphere-zone`, `data-atmosphere-intensity` und `data-atmosphere-seed`; `data-audio-layers` zeigt die freigegebenen Klangschichten. CPU-/GPU-P95, Figuren-Cache und Begründung der adaptiven Qualitätswahl stehen in `data-render-cpu-p95`, `data-gpu-p95`, `data-character-cache` und `data-quality-reason`. Desktop startet ab 700 CSS-Pixeln in Master, Mobile in Balanced; verdeckte Tabs und Reduced Motion fließen nicht in die Messfenster ein. Die 26 V3-Playwright-Baselines decken weiterhin die drei Übersichten, Ritual- und Begegnungsfolgen mit je drei Shots, alle mobilen Orte, Reduced Motion und den kombinierten Renderer-/Art-Fallback ab. Zwölf zusätzliche V5-Baselines sichern Venue-Signaturen, Außenwellen, Mobile, Reduced Motion und Atmosphärenfallback ab.
