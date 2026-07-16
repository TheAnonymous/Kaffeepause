# Fidelity ledger

Final comparison pass: 16 July 2026. Concepts and browser captures were reviewed side by side at native resolution with `view_image`. Browser/IAB was unavailable in this environment, so deterministic Playwright Chromium captures were used as the rendering fallback.

## Sources

- Golden Frames: `golden-cafe.png`, `golden-ramen.png`, `golden-arcade.png`
- Desktop implementation: `e2e/cafe.spec.ts-snapshots/v3-*-overview-chromium-linux.png` at 1440 × 810
- Mobile implementation: `e2e/cafe.spec.ts-snapshots/v3-*-mobile-chromium-linux.png` at 390 × 844

## Comparison

| Point | Café | Ramen | Arcade |
| --- | --- | --- | --- |
| Spatial silhouette | Window, bench, shared table and service counter preserve the Golden Frame hierarchy. | Long counter, kitchen band, noren and side table preserve the Golden Frame hierarchy. | Side lanes, rear entry, prize counter and central lounge preserve the venue's functional flow. |
| Focal hierarchy | Rainy city first, guests second, authored pastry/espresso details third. | Paper lamps and counter guests first, kitchen craft second. | People and cabinets stay brighter than the open play lane; cyan, magenta and amber remain the only accents. |
| Palette and light | Warm walnut against cool rain; no large smooth spotlight ellipses. | Warm lacquer, celadon tile and paper light; deliberately quieter than the concept kitchen. | Dark navy base with restrained neon and warm wall lights; brighter base fill keeps Reduced Motion readable. |
| Material detail | Hand-authored 32 px wood, plaster, floor, metal and glass patterns plus four curated hero crops. | Tile, wood, floor and metal relief plus curated kitchen and noren crops. | Worn wall/floor patterns, individualized cabinet geometry, prize shelf and lounge/rug crop. |
| Figure integrity | Deterministic authored sprites remain the only people in the room. | Same; no generated staff or duplicated guests in the backdrop. | Same; all cabinet players remain simulation-owned and focusable. |
| Responsive composition | Static mobile frame biases toward the bench conversation and shared table. | Static mobile frame biases toward the kitchen craft and occupied counter. | Static mobile frame biases toward the active right cabinet lane and prize counter instead of an empty doorway. |
| Copy and interaction | No user-facing copy drift. Venue selection, entry, audio, fullscreen, hover reactions, camera focus and stories are unchanged. | Same. | Same. |

## Intentional deviations

- The production rooms use spatial Three.js geometry rather than flattening the Golden Frames into backgrounds. This preserves weather, focus occlusion, character motion, venue switching and accessibility behavior.
- Prop density is lower than the concepts where extra geometry would compete with story readability or exceed the fixed draw-call budgets.
- The arcade keeps a wider central lane than the concept because it is a real navigation and story corridor, not decorative negative space.
- Generated production art is restricted to reviewed, people-free, text-free material and prop crops. Character atlases are intentionally blank; all visible people are deterministic runtime sprites.

## Verification contract

- Desktop native QA: 1440 × 810.
- Mobile native QA: 390 × 844.
- Core interaction QA: Playwright Chromium.
- Visual acceptance: overview, cinematic beats, weather waves, Reduced Motion, fallback and mobile baselines.
- Runtime acceptance: fixed renderer and texture budgets, production preview, context-loss recovery.
