// Zentrale Maßsprache der 384×216-Diorama-Welt. Renderer, Simulation und Tests
// beziehen ihre tragenden Silhouetten aus denselben Werten, damit Möbel nicht
// unbemerkt gegen Figuren, Laufwege oder die Tiefenstaffelung wachsen.

export interface SceneProportions {
  readonly world: {
    readonly width: number;
    readonly height: number;
    readonly renderScale: number;
    readonly floorHorizonY: number;
    readonly foregroundBaseY: number;
  };
  readonly character: {
    readonly standingHeight: number;
    readonly hostHeight: number;
    readonly seatedHeight: number;
    readonly headHeight: number;
    readonly standingBodyHeight: number;
    readonly seatedBodyHeight: number;
    readonly bodyWidth: number;
    readonly collisionRadius: number;
  };
  readonly door: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly entranceX: number;
    readonly entranceY: number;
  };
  readonly counter: {
    readonly x: number;
    readonly width: number;
    readonly surfaceY: number;
    readonly frontX: number;
    readonly frontWidth: number;
    readonly frontY: number;
    readonly workerFootY: number;
    readonly baseY: number;
  };
  readonly dining: {
    readonly rearSurfaceY: number;
    readonly rearSeatY: number;
    readonly rearScale: number;
    readonly frontSurfaceY: number;
    readonly frontMomentY: number;
    readonly frontSeatY: number;
    readonly frontTableWidth: number;
    readonly frontTableThickness: number;
    readonly frontTableCenters: readonly [number, number];
    readonly frontTableLegBottomY: number;
    readonly seatPairSpacing: number;
  };
  readonly navigation: {
    readonly minimumWalkway: number;
  };
}

export const SCENE_PROPORTIONS: SceneProportions = {
  world: {
    width: 384,
    height: 216,
    // 6× ist die tatsächliche Masterauflösung. Die 384×216-Welt bleibt für
    // Simulation und Proportionen stabil, während eine Figur nun bis zu
    // 192 echte Rasterpixel Höhe für Gesicht, Stoff und Lichtkanten erhält.
    renderScale: 6,
    floorHorizonY: 134,
    foregroundBaseY: 211,
  },
  character: {
    standingHeight: 32,
    hostHeight: 38,
    seatedHeight: 24.5,
    headHeight: 10,
    standingBodyHeight: 20.5,
    seatedBodyHeight: 14.5,
    bodyWidth: 13,
    collisionRadius: 4.25,
  },
  door: {
    x: 3,
    y: 100,
    width: 43,
    height: 82,
    entranceX: 24,
    entranceY: 188,
  },
  counter: {
    x: 276,
    width: 108,
    surfaceY: 128,
    frontX: 282,
    frontWidth: 99,
    frontY: 138,
    workerFootY: 146,
    baseY: 213,
  },
  dining: {
    rearSurfaceY: 160,
    rearSeatY: 147,
    rearScale: 0.9,
    frontSurfaceY: 178,
    frontMomentY: 181,
    frontSeatY: 187,
    frontTableWidth: 31,
    frontTableThickness: 3,
    frontTableCenters: [105, 179],
    frontTableLegBottomY: 204,
    seatPairSpacing: 30,
  },
  navigation: {
    minimumWalkway: 32,
  },
};

export interface ProportionIssue {
  readonly code: string;
  readonly message: string;
}

export interface ProportionReport {
  readonly valid: boolean;
  readonly score: number;
  readonly issues: readonly ProportionIssue[];
  readonly ratios: Readonly<{
    characterToWorld: number;
    seatedToStanding: number;
    tableToCharacter: number;
    counterToHost: number;
    rearToFront: number;
    walkwayInBodies: number;
  }>;
}

function between(value: number, minimum: number, maximum: number): boolean {
  return value >= minimum && value <= maximum;
}

export function validateSceneProportions(proportions: SceneProportions = SCENE_PROPORTIONS): ProportionReport {
  const { world, character, door, counter, dining, navigation } = proportions;
  const issues: ProportionIssue[] = [];
  const require = (condition: boolean, code: string, message: string): void => {
    if (!condition) issues.push({ code, message });
  };

  const characterToWorld = character.standingHeight / world.height;
  const seatedToStanding = character.seatedHeight / character.standingHeight;
  const tableToCharacter = (dining.frontSeatY - dining.frontSurfaceY) / character.standingHeight;
  const counterToHost = (counter.workerFootY - counter.surfaceY) / character.hostHeight;
  const rearToFront = dining.rearScale;
  const rightTableEdge = dining.frontTableCenters[1] + dining.frontTableWidth / 2;
  const walkway = counter.x - rightTableEdge;
  const walkwayInBodies = walkway / character.bodyWidth;

  require(world.width === 384 && world.height === 216, 'world-canvas', 'Die kanonische Szenenfläche muss 384×216 Pixel groß bleiben.');
  require(Number.isInteger(world.renderScale) && between(world.renderScale, 4, 8), 'render-scale', 'Der Renderfaktor muss ein ganzzahliger HD-Pixelmaßstab zwischen 4 und 8 sein.');
  require(between(world.floorHorizonY / world.height, 0.58, 0.66), 'floor-horizon', 'Die Bodenkante liegt außerhalb der glaubwürdigen Raumtiefe.');
  require(between(characterToWorld, 0.12, 0.18), 'character-world-scale', 'Die Figurenhöhe passt nicht zur Raumhöhe.');
  require(between(seatedToStanding, 0.68, 0.84), 'seated-character-scale', 'Sitzende und stehende Figuren haben keine gemeinsame Körperproportion.');
  require(character.headHeight + character.standingBodyHeight <= character.standingHeight, 'character-segments', 'Kopf und Rumpf überschreiten die festgelegte Figurenhöhe.');
  require(character.headHeight + character.seatedBodyHeight <= character.seatedHeight, 'seated-segments', 'Die sitzende Silhouette überschreitet ihre festgelegte Figurenhöhe.');
  require(between(character.bodyWidth / character.standingHeight, 0.32, 0.48), 'character-silhouette', 'Breite und Höhe der Figurensilhouette stehen nicht im Verhältnis.');
  require(between((character.collisionRadius * 2) / character.bodyWidth, 0.55, 0.8), 'collision-body-scale', 'Kollisionsradius und sichtbare Körperbreite laufen auseinander.');
  require(between(tableToCharacter, 0.22, 0.38), 'table-seat-height', 'Die vordere Tischkante liegt nicht glaubwürdig vor einer sitzenden Figur.');
  require(between(dining.frontTableWidth / character.bodyWidth, 2, 2.8), 'table-width', 'Ein Zweiertisch ist für die Figuren zu schmal oder zu breit.');
  require(between(counterToHost, 0.35, 0.58), 'counter-height', 'Die Arbeitskante der Theke liegt nicht zwischen Hüfte und Taille des Personals.');
  require(between(rearToFront, 0.82, 0.94), 'depth-scale', 'Hintere Möbel müssen sichtbar kleiner als vordere Möbel sein.');
  require(dining.frontSurfaceY - dining.rearSurfaceY >= character.standingHeight * 0.45, 'depth-spacing', 'Vordere und hintere Essensebene liegen perspektivisch zu dicht beieinander.');
  require(door.width >= character.bodyWidth * 2.5 && door.width <= character.bodyWidth * 4, 'door-width', 'Die Türöffnung passt nicht zu den Figuren.');
  require(door.height >= character.standingHeight * 2.2 && door.height <= character.standingHeight * 2.8, 'door-height', 'Die Türhöhe passt nicht zur Figurenhöhe.');
  require(walkway >= navigation.minimumWalkway && walkwayInBodies >= 2.5, 'main-walkway', 'Zwischen Tischen und Theke fehlt ein glaubwürdiger Hauptlaufweg.');
  require(counter.x + counter.width <= world.width && counter.baseY <= world.height, 'counter-bounds', 'Die Theke ragt aus der Szenenfläche.');
  require(dining.frontTableLegBottomY < world.foregroundBaseY, 'furniture-grounding', 'Tischbeine und Vordergrundsockel überlagern sich.');
  require(dining.frontTableCenters[1] - dining.frontTableCenters[0] >= dining.frontTableWidth * 2, 'table-spacing', 'Die vorderen Tische stehen zu dicht zusammen.');

  return {
    valid: issues.length === 0,
    score: Math.max(0, 100 - issues.length * 8),
    issues,
    ratios: { characterToWorld, seatedToStanding, tableToCharacter, counterToHost, rearToFront, walkwayInBodies },
  };
}

export const SCENE_PROPORTION_REPORT = validateSceneProportions();
