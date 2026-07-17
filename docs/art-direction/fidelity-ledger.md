# Fidelity ledger

Final comparison pass: 16 July 2026. Concepts and browser captures were reviewed side by side at native resolution with `view_image`. Browser/IAB was unavailable in this environment, so deterministic Playwright Chromium captures were used as the rendering fallback.

Living Direction comparison pass: 17 July 2026. The three V7 movement captures were inspected at original resolution beside the accepted Golden Frames. The V6 visual system remains the source of truth; V7 changes blocking, staging and movement only.

## Sources

- Golden Frames: `golden-cafe.png`, `golden-ramen.png`, `golden-arcade.png`
- Desktop implementation: `e2e/cafe.spec.ts-snapshots/v3-*-overview-chromium-linux.png` at 1440 × 810
- Mobile implementation: `e2e/cafe.spec.ts-snapshots/v3-*-mobile-chromium-linux.png` at 390 × 844
- Living Direction implementation: `e2e/cafe.spec.ts-snapshots/v7-living-*-chromium-linux.png` at 1440 × 810

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

## V7 Living Direction comparison

| Comparison point | Golden evidence | Browser evidence | Result |
| --- | --- | --- | --- |
| Spatial hierarchy | Window/bench, long counter and central game lane are the defining silhouettes. | All three V7 captures preserve those silhouettes while the active figure stays on a readable foreground or central route. | Match; no layout reinterpretation. |
| Character contact | Figures have clear foot contact and do not merge into furniture. | Café walker, Ramen counter departure and Arcade lane movement retain separate silhouettes and visible floor contact. | Match after moving the Café capture deeper into its front-lane pass. |
| Palette and light | Café amber/rain blue, Ramen lacquer/celadon and Arcade navy/neon. | The same V6 venue profiles, art atlases, material assignments and exposure values render every V7 sequence. | Exact system reuse; no new tint or overlay. |
| Navigation geometry | Golden scenes leave a readable foreground or central circulation band. | Authored `y = 210` front lanes and the Arcade center lane follow that negative space instead of cutting through hero furniture. | Match with functional collision geometry. |
| Figure density | Small, legible groups with clear quiet zones. | At most two authored walks run at once; destinations and recovery pockets are reserved. | Match; no crowd or filler increase. |
| Motion language | Preparation, action and afterglow; no frantic ambient movement. | Each route has a named purpose, pause, cooldown and return. Reduced Motion keeps static sprite frames while spatial navigation remains safe. | Match. |
| UI copy and chrome | Existing passive observation experience. | No new controls, labels, badges or visible diagnostic UI were introduced. | Exact copy diff: no additions, removals or renames. |
| Responsive behavior | Mobile preserves the same rooms with a guided camera. | All three Golden Sequences complete at 390 × 844 with Reduced Motion, low particles, zero deadlocks and the same collision contract. | Match. |

## Intentional deviations

- The production rooms use spatial Three.js geometry rather than flattening the Golden Frames into backgrounds. This preserves weather, focus occlusion, character motion, venue switching and accessibility behavior.
- Prop density is lower than the concepts where extra geometry would compete with story readability or exceed the fixed draw-call budgets.
- The arcade keeps a wider central lane than the concept because it is a real navigation and story corridor, not decorative negative space.
- Generated production art is restricted to reviewed, people-free, text-free material and prop crops. Character atlases are intentionally blank; all visible people are deterministic runtime sprites.
- V7 keeps the front circulation lane slightly deeper than the original still concepts. This is the smallest physical clearance that lets a full-size figure pass an occupied chair without overlap and remains within the existing 216-pixel scene floor.

## Verification contract

- Desktop native QA: 1440 × 810.
- Mobile native QA: 390 × 844.
- Core interaction QA: Playwright Chromium.
- Living Direction QA: three desktop Golden Sequence captures plus three 390 × 844 Reduced-Motion completion tests.
- Visual acceptance: overview, cinematic beats, weather waves, Reduced Motion, fallback and mobile baselines.
- Runtime acceptance: fixed renderer and texture budgets, production preview, context-loss recovery, 3 venues × 3 seeds × 30 simulated minutes of collision and deadlock checks.
