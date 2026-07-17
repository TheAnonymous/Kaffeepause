# Kaffeepause V7 Living Direction

V7 macht die vorhandenen Orte nicht voller, sondern glaubwürdiger bewohnt. Figuren laufen nur mit erkennbarem Anlass: Sie holen etwas, wechseln kurz den Blickpunkt, grüßen oder kehren über eine bewusst gesetzte Laufgasse an ihren Platz zurück. Zufälliges Umherwandern ist ausgeschlossen.

## Choreografie

| Ort | Golden Sequence | Weitere Wege | Räumlicher Rhythmus |
| --- | --- | --- | --- |
| Café | `cafe-window-to-pastry` | `cafe-table-cup-return`, `cafe-doorway-greeting-walk` | Fensterbank → vordere Laufgasse → Kuchenvitrine beziehungsweise Tür → Rückkehr |
| Ramen | `ramen-counter-water` | `ramen-noren-breath`, `ramen-condiment-walk` | Theke → freie Frontgasse → Wasser, Noren oder Gewürzstation → Rückkehr |
| Arcade | `arcade-token-lane` | `arcade-prize-browse`, `arcade-lounge-loop` | Automatenplatz → mittlere Spielgasse → Token, Preisregal oder Lounge → Rückkehr |

Jeder Weg besitzt einen reservierten Namen, feste Haltepunkte, optionale Zwischenpunkte, eine kurze Tätigkeit am Ziel, einen Cooldown und einen Rückweg zum weiterhin reservierten Stammplatz. Höchstens zwei Wege laufen gleichzeitig. Eine erzwungene Golden Sequence hat bei Diagnoseläufen Vorrang, damit ihre Aufnahme nicht von einem zufällig früher begonnenen Nebenweg verdrängt wird.

## Navigationsvertrag

1. Jede Venue definiert einen echten begehbaren Bereich, einen schmalen Türkorridor, statische Möbel-Collider und drei freie Ausweichpunkte.
2. Sitz-, Warte-, Queue-, Bewegungs- und Recovery-Ziele werden zentral reserviert. Zwei Figuren können daher nie dasselbe Ziel besitzen.
3. Das Raster-Routing führt um Wände, Theken, Tische, Bänke, Automaten und große Requisiten. Die vordere Laufgasse reicht bis `y = 210`, damit besetzte Möbel nicht den einzigen Ausgang abschneiden.
4. Bewegte Figuren halten mindestens 9,5 Szenenpixel Abstand; stehende oder sitzende Figuren erhalten einen etwas größeren Schutzkreis.
5. Ausgang, Eintritt, Sitzweg, Rückkehr, Szenenweg und Queue besitzen eine feste Vorfahrt. Die nachrangige Figur weicht deterministisch aus, statt mit zufälligem Zittern zu reagieren.
6. Wird der Fortschritt für 0,25 Sekunden unterbrochen, plant die Figur einen tangentialen Umweg um den konkreten Blocker. Bleibt der Weg belegt, nutzt sie einen reservierten Ausweichpunkt und berechnet den verbleibenden Weg vollständig neu.
7. Ein Wechsel des Ziels räumt alte Recovery-Reservierungen auf. Beim Verlassen werden ausnahmslos alle Sitz-, Wege- und Ausweichreservierungen freigegeben.
8. Es gibt keinen sichtbaren Teleport-Fallback. Ein sechs Sekunden langer Stillstand gilt als Deadlock und lässt die Langzeitprüfung fehlschlagen.

## Golden-Sequences und visuelle Abnahme

- `v7-living-cafe`: eine Figur auf der vorderen Laufgasse, getrennt von Fensterbank, Tisch und Pflanze.
- `v7-living-ramen`: ein Gast löst sich lesbar von der Theke, während der Küchenbereich frei bleibt.
- `v7-living-arcade`: Bewegung bleibt in der mittleren Spielgasse; Automatenplätze und Tokenbereich behalten klare Silhouetten.

Die Captures werden bei 1440 × 810 in Chromium Balanced aufgenommen und direkt gegen die V6 Golden Frames geprüft. V7 verändert weder Art-Packs noch Palette, Materialsystem, Kamera-Grundkomposition oder UI-Copy.

## Automatische Abnahme

Die deterministische Langzeitmatrix simuliert Café, Ramen und Arcade mit drei Seeds jeweils 30 Minuten. In jedem Schritt werden Möbelüberschneidungen, begehbarer Bereich und Fortschritt geprüft; alle fünf Schritte zusätzlich die Abstände zwischen sämtlichen sichtbaren Figuren. Die Matrix verlangt:

- keine statische Kollision und kein Verlassen des begehbaren Bereichs,
- mindestens 9,5 Szenenpixel Figurenabstand,
- keinen sechs Sekunden langen Stillstand,
- keine gemeldeten Deadlocks und nie sechs Sekunden ohne räumlichen Fortschritt,
- mehrere vollständig abgeschlossene Living Sequences pro Lauf,
- kollisionsfreie Personalbewegung hinter der Theke.

Der Canvas veröffentlicht den Zustand über `data-navigation-status`, `data-navigation-moving`, `data-navigation-yielding`, `data-navigation-blocked`, `data-navigation-replans`, `data-navigation-recoveries`, `data-navigation-deadlocks`, `data-navigation-max-blocked`, `data-navigation-minimum-distance`, `data-living-direction`, `data-living-route`, `data-living-completed` und `data-golden-living-sequence`.
