# Kaffeepause

Ein kleines Pixel-Art-Diorama zum Zuschauen – für mich und meine Freunde.

**[Kaffeepause öffnen →](https://kaffeepause.jodie-oesterling.de/)**

![Das Café am Mittag](docs/kaffeepause-preview.webp)

## Was passiert da?

Du suchst dir einen Ort aus: ein gemütliches Café, ein warmes Ramen-Restaurant oder eine ruhige Arcade-Halle. Danach läuft alles von selbst. Gäste kommen und gehen, bestellen, lesen, stricken, zeichnen, reden und spielen. Zwölf Stammgäste bringen kleine Geschichten mit, von Maras Skizzenbuch über eine vertauschte Bestellung bis zur widerspenstigen Nudel. Ab und zu passiert ein harmloses Missgeschick, und danach geht alles ruhig weiter.

- Tageszeit und Wetter verändern Licht, Fenster und Geräusche.
- Wenn du mit der Maus auf einer Figur verweilst, reagiert sie.
- Lo-fi-Musik und Raumklang lassen sich ausschalten; es gibt einen Vollbildmodus.
- Auf dem Handy fährt die Kamera langsam durch den Raum.
- Bei reduzierter Bewegung bleibt die Kamera still.

## Standort und Wetter

Beim Laden fragt Kaffeepause nach dem Browserstandort. Die Koordinaten bleiben ausschließlich im Arbeitsspeicher, werden für den Wetterabruf auf zwei Dezimalstellen gerundet und weder gespeichert noch rückwärts geokodiert. Bei Ablehnung, ungültigen Daten oder fehlendem Netz läuft das Café ohne Einschränkung mit einer Ersatzumgebung weiter.

Live-Wetter stammt aus der keylosen [Open‑Meteo Forecast API](https://open-meteo.com/en/docs) und wird höchstens alle 15 Minuten aktualisiert. Die sichtbare Attribution im Café verweist auf [Open‑Meteo](https://open-meteo.com/); das Projekt nutzt dessen nichtkommerzielles Modell. Zeit, Standort und Wetter gehen an kein eigenes Backend.

## Lokal starten

```sh
npm install
npm run dev
```

## Prüfen und veröffentlichen

```sh
npm run check     # Unit-Tests, Build, Rauchtest und Browser-Tests
npm run release   # prüft alles und veröffentlicht nach Rückfrage
```

`npm run release -- --rollback` schaltet auf das vorherige Release zurück. Die Browser-Tests legen Bilder aller Orte zu mehreren Tageszeiten in `look/` ab, so lässt sich eine Änderung am Licht direkt ansehen.

Wie der Code aufgebaut ist und welche Testparameter es gibt, steht in [docs/ENTWICKLUNG.md](docs/ENTWICKLUNG.md).

<!-- github-cicd-policy -->
## Local validation policy

This repository does not use GitHub Actions or any other GitHub-hosted CI/CD. Run tests, linters, builds, and all other checks locally before merging. A documented successful local test run is sufficient for review and merge.
<!-- /github-cicd-policy -->
