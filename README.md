# Kaffeepause

Ein autonomes Pixel-Art-Café für eine kleine Pause im Browser.

**[Café betreten →](https://theanonymous.github.io/Kaffeepause/)**

![Das Pixel-Art-Café Kaffeepause an einem Regentag](docs/kaffeepause-preview.png)

## Über das Projekt

Kaffeepause zeigt ein gemütliches Café am Regentag als bildschirmfüllendes Canvas-Diorama. Gäste kommen und gehen, bestellen, lesen, arbeiten, reden und trinken – vollständig selbstständig und ohne sichtbaren Schleifensprung.

- handgezeichnete Canvas-Pixelart ohne externe Assets
- deterministische Figuren-Zustandsautomaten und zentrale Platzreservierung
- generativer Lo-fi-Jazz, Regen und Café-Geräusche über Web Audio
- langsame Kamerafahrt auf schmalen Smartphone-Displays
- Reduced-Motion-Modus mit ruhiger Kamera und weniger Partikeln
- rein clientseitig, ohne Backend oder Laufzeit-Netzwerkzugriffe

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

Die Szene verwendet eine logische Auflösung von 384 × 216 Pixeln und wird ohne Weichzeichnung auf die Browserfläche skaliert.
