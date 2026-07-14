import { CafeCamera } from './camera';
import { CafeSimulation } from './simulation/cafeSimulation';
import { WORLD_HEIGHT, WORLD_WIDTH } from './simulation/layout';
import type { Barista, CafeAccident, CafeMoment, Guest } from './simulation/types';
import type { CafeEnvironmentSnapshot, DayPhase } from './environment/types';

// Drei physische Pixel pro Szenenpixel lassen kleine Licht-, Holz- und Stoffdetails
// klarer wirken, ohne den bewusst groben Pixel-Art-Charakter zu verlieren.
export const RENDER_SCALE = 3;

const COLORS = {
  ink: '#241923',
  deepest: '#17131e',
  night: '#252b43',
  rain: '#7087a2',
  wallDark: '#624447',
  wall: '#8a5b50',
  wallLight: '#b7795e',
  cream: '#e1bd83',
  glow: '#f2c274',
  floor: '#493338',
  floorLight: '#654346',
  wood: '#77483b',
  woodLight: '#a96549',
  counter: '#a8694b',
} as const;

// Ein einzelner physischer Pixel auf dem hochaufgelösten Canvas.
const HALF_PIXEL = 1 / RENDER_SCALE;

function snap(value: number): number {
  return Math.round(value * RENDER_SCALE) / RENDER_SCALE;
}

function rect(context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number): void {
  const left = snap(x);
  const top = snap(y);
  const right = snap(x + width);
  const bottom = snap(y + height);
  context.fillStyle = color;
  context.fillRect(left, top, Math.max(HALF_PIXEL, right - left), Math.max(HALF_PIXEL, bottom - top));
}

function polygon(context: CanvasRenderingContext2D, color: string, points: readonly [number, number][]): void {
  const first = points[0];
  if (!first) return;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(snap(first[0]), snap(first[1]));
  for (const point of points.slice(1)) context.lineTo(snap(point[0]), snap(point[1]));
  context.closePath();
  context.fill();
}

function guestVariant(guest: Guest): number {
  const numericId = Number.parseInt(guest.id.replace(/\D/g, ''), 10);
  return Number.isFinite(numericId) ? numericId % 6 : 0;
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function mixColor(left: string, right: string, amount: number): string {
  const progress = clamp(amount);
  const parse = (color: string, offset: number): number => Number.parseInt(color.slice(offset, offset + 2), 16);
  const channel = (offset: number): string => Math.round(parse(left, offset) + (parse(right, offset) - parse(left, offset)) * progress)
    .toString(16)
    .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

function skyPalette(phase: DayPhase): readonly [string, string, string] {
  if (phase === 'dawn') return ['#51435f', '#c87968', '#e8ad78'];
  if (phase === 'morning') return ['#7599b2', '#a9c3c8', '#e8c995'];
  if (phase === 'midday') return ['#5e91bb', '#91b6cb', '#d4d9c3'];
  if (phase === 'afternoon') return ['#6d91aa', '#b1b8ad', '#d8b27e'];
  if (phase === 'dusk') return ['#4d4260', '#a35e68', '#d58a69'];
  if (phase === 'evening') return ['#39405d', '#64536c', '#a96864'];
  return ['#171c31', '#252d45', '#35425a'];
}

export class CafeRenderer {
  private readonly context: CanvasRenderingContext2D;
  private reducedMotion = false;
  private active = false;
  private environment?: CafeEnvironmentSnapshot;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly simulation: CafeSimulation,
    private readonly camera: CafeCamera,
  ) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D wird von diesem Browser nicht unterstützt.');
    this.context = context;
    this.context.imageSmoothingEnabled = false;
  }

  setActive(active: boolean): void {
    this.active = active;
  }

  setEnvironment(snapshot: CafeEnvironmentSnapshot): void {
    this.environment = snapshot;
    this.canvas.dataset.dayPhase = snapshot.dayPhase;
    this.canvas.dataset.weather = snapshot.weather.kind;
    this.canvas.dataset.weatherSource = snapshot.weatherSource;
    this.canvas.dataset.localTime = snapshot.localTimeText;
    this.canvas.dataset.locationState = snapshot.locationState;
    this.canvas.dataset.crowdTarget = String(snapshot.targetCrowd);
  }

  resize(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    const mobile = window.innerWidth < 700;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const sceneWidth = mobile
      ? Math.max(112, Math.min(210, Math.round(WORLD_HEIGHT * aspect)))
      : WORLD_WIDTH;

    this.canvas.width = sceneWidth * RENDER_SCALE;
    this.canvas.height = WORLD_HEIGHT * RENDER_SCALE;
    this.context.imageSmoothingEnabled = false;
    this.canvas.dataset.logicalWidth = String(this.canvas.width);
    this.canvas.dataset.sceneWidth = String(sceneWidth);
    this.canvas.dataset.renderScale = String(RENDER_SCALE);
    this.canvas.dataset.particles = reducedMotion ? 'low' : 'full';
    this.camera.configure(sceneWidth, mobile, reducedMotion);
    this.canvas.dataset.cameraMode = this.camera.mode;
  }

  render(elapsed: number): void {
    const time = this.active ? elapsed : 0;
    const context = this.context;
    const cameraX = snap(this.camera.x);
    const accident = this.simulation.activeAccident;
    const shaking = !this.reducedMotion && accident?.kind === 'tray-drop' && accident.phase === 'chaos';
    const shakeX = shaking ? Math.round(Math.sin(accident.phaseElapsed * 58)) * HALF_PIXEL : 0;
    const shakeY = shaking ? Math.round(Math.cos(accident.phaseElapsed * 47)) * HALF_PIXEL : 0;

    context.save();
    context.setTransform(
      RENDER_SCALE,
      0,
      0,
      RENDER_SCALE,
      (-cameraX + shakeX) * RENDER_SCALE,
      shakeY * RENDER_SCALE,
    );
    context.imageSmoothingEnabled = false;
    this.drawRoom(time);
    this.drawFloorDecor(time);
    this.drawWindows(time);
    this.drawDoor(time);
    this.drawArchitecture(time);
    this.drawFurnitureBack();
    this.drawCounterBack(time);
    this.drawBarista(this.simulation.barista, time);
    this.drawCounterFront();

    const guests = [...this.simulation.guests].sort((left, right) => left.position.y - right.position.y);
    for (const guest of guests) this.drawGuest(guest);

    this.drawFurnitureFront();
    const moment = this.simulation.activeMoment;
    if (moment) this.drawMoment(moment);
    this.drawCafeDetails(time);
    if (accident) this.drawAccident(accident);
    this.drawForeground(time);
    context.restore();
    this.canvas.dataset.cameraX = this.camera.x.toFixed(1);
    this.canvas.dataset.guestCount = String(this.simulation.guests.length);
    this.canvas.dataset.accident = accident?.kind ?? 'none';
    this.canvas.dataset.accidentPhase = accident?.phase ?? 'none';
    this.canvas.dataset.moment = moment?.kind ?? 'none';
  }

  private drawRoom(time: number): void {
    const context = this.context;
    const solarLight = clamp(((this.environment?.solar.elevation ?? -12) + 8) / 58);
    const wall = mixColor('#60434a', '#9c6857', solarLight);
    const wallLight = mixColor('#865447', '#c58a68', solarLight);
    rect(context, COLORS.deepest, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    rect(context, COLORS.wallDark, 0, 9, WORLD_WIDTH, 126);
    rect(context, wall, 0, 14, WORLD_WIDTH, 101);
    rect(context, '#9b6554', 0, 93, WORLD_WIDTH, 22);
    rect(context, '#ad7059', 0, 105, WORLD_WIDTH, 2);
    for (let x = 4; x < WORLD_WIDTH; x += 21) {
      rect(context, x % 42 === 4 ? '#c17e61' : '#87554c', x, 109, 13, HALF_PIXEL);
      rect(context, '#76474a', x + 3, 111, HALF_PIXEL, 2);
    }
    rect(context, wallLight, 0, 115, WORLD_WIDTH, 18);
    rect(context, '#c58764', 0, 115, WORLD_WIDTH, 1);
    rect(context, COLORS.ink, 0, 130, WORLD_WIDTH, 4);
    rect(context, '#6c4444', 0, 128, WORLD_WIDTH, 2);
    rect(context, COLORS.floor, 0, 134, WORLD_WIDTH, 82);

    for (let index = 0; index < 34; index += 1) {
      const x = (index * 37 + 13) % WORLD_WIDTH;
      const y = 18 + ((index * 29) % 108);
      const color = index % 3 === 0 ? '#a66b57' : index % 3 === 1 ? '#754a47' : '#925e50';
      rect(context, color, x, y, index % 4 === 0 ? 2 : 1, HALF_PIXEL);
      if (index % 5 === 0) rect(context, '#6f4645', x + 1.5, y + HALF_PIXEL, HALF_PIXEL, 1.5);
    }

    for (let y = 137; y < WORLD_HEIGHT; y += 13) {
      rect(context, y % 26 === 7 ? '#5b3d40' : COLORS.floorLight, 0, y, WORLD_WIDTH, HALF_PIXEL);
      rect(context, '#35272f', 0, y + HALF_PIXEL, WORLD_WIDTH, HALF_PIXEL);
    }
    for (let x = -40; x < WORLD_WIDTH + 40; x += 31) {
      polygon(context, '#3d2d34', [[x, 216], [x + 1.5, 216], [x + 53.5, 134], [x + 52, 134]]);
      polygon(context, '#74504b', [[x + 2, 216], [x + 2.5, 216], [x + 54.5, 134], [x + 54, 134]]);
    }

    for (let index = 0; index < 18; index += 1) {
      const x = 12 + index * 22;
      const y = 144 + ((index * 17) % 63);
      rect(context, index % 2 ? '#6b4747' : '#392a32', x, y, 5 + (index % 4) * 2, HALF_PIXEL);
    }

    const lampPulse = this.reducedMotion ? 1 : 1 + Math.sin(time * 0.72) * 0.5;
    const poolColor = lampPulse > 1.2 ? '#d88955' : '#cf7d50';
    rect(context, poolColor, 0, 111.5, WORLD_WIDTH, 2.5);
    rect(context, '#f0b764', 58, 116, 196, 1);
    rect(context, '#d98954', 67, 118, 178, HALF_PIXEL);

    if (solarLight > 0.05 && (this.environment?.weather.cloudCover ?? 100) < 82) {
      const fromRight = (this.environment?.solar.azimuth ?? 180) > 180;
      const startX = fromRight ? 248 : 52;
      const endX = fromRight ? 96 : 225;
      context.save();
      context.globalAlpha = solarLight * (1 - (this.environment?.weather.cloudCover ?? 0) / 130) * 0.22;
      polygon(context, '#ffe6a3', [[startX, 104], [startX + (fromRight ? -28 : 28), 104], [endX + 38, 211], [endX, 211]]);
      context.restore();
    }
  }

  private drawFloorDecor(time: number): void {
    const context = this.context;
    const shimmer = this.reducedMotion ? 0 : Math.sin(time * 1.4) * HALF_PIXEL;

    // Der Teppich füllt den bisher sehr offenen Mittelgrund und verankert die Sitzgruppe.
    polygon(context, '#2c303b', [[54, 177], [67, 169], [211, 169], [231, 179], [225, 205], [207, 211], [73, 211], [51, 202]]);
    polygon(context, '#5f5458', [[59, 180], [72, 173], [207, 173], [226, 181], [220, 201], [205, 207], [77, 207], [57, 200]]);
    polygon(context, '#7b645d', [[66, 181], [80, 176], [200, 176], [216, 182], [210, 198], [198, 203], [84, 203], [64, 197]]);
    polygon(context, '#3d3c49', [[75, 183], [100, 177], [181, 177], [207, 184], [202, 195], [185, 201], [98, 201], [72, 195]]);
    for (let index = 0; index < 9; index += 1) {
      const x = 78 + index * 14;
      const y = index % 2 === 0 ? 180 : 198;
      rect(context, index % 3 === 0 ? '#d09b63' : '#a76d55', x, y, 6, 1);
      rect(context, '#e6bb72', x + 2, y + HALF_PIXEL + shimmer, 2, HALF_PIXEL);
    }
    for (let x = 70; x < 214; x += 8) {
      rect(context, '#bc825d', x, 207, 3, HALF_PIXEL);
      rect(context, '#9c6757', x + 1, 208, HALF_PIXEL, 2);
    }
  }

  private drawWindows(time: number): void {
    const context = this.context;
    const environment = this.environment;
    const weather = environment?.weather;
    const palette = skyPalette(environment?.dayPhase ?? 'night');
    const cloudCover = weather?.cloudCover ?? 85;
    const fogVisibility = 0.35;
    rect(context, '#201a24', 47, 19, 208, 90);
    rect(context, '#86584d', 48.5, 20.5, 205, 87);

    context.save();
    context.beginPath();
    context.rect(52, 24, 198, 78);
    context.clip();

    rect(context, palette[0], 52, 24, 198, 26);
    rect(context, palette[1], 52, 50, 198, 26);
    rect(context, palette[2], 52, 76, 198, 26);

    const nightStrength = environment?.dayPhase === 'night' ? 1 : environment?.dayPhase === 'dawn' || environment?.dayPhase === 'dusk' ? 0.45 : 0;
    if (nightStrength > 0 && cloudCover < 90) {
      context.save();
      context.globalAlpha = nightStrength * (1 - cloudCover / 120);
      for (let index = 0; index < 24; index += 1) {
        const x = 55 + ((index * 47) % 191);
        const y = 27 + ((index * 19) % 45);
        rect(context, index % 4 === 0 ? '#fff2be' : '#c9d6d3', x, y, index % 5 === 0 ? 1 : HALF_PIXEL, HALF_PIXEL);
      }
      context.restore();
    }

    const celestialDay = (environment?.solar.elevation ?? -10) >= -0.833;
    const celestialX = 53 + (((environment?.solar.azimuth ?? 180) / 360) * 194);
    const celestialY = 78 - clamp(((environment?.solar.elevation ?? -6) + 6) / 66) * 48;
    if (cloudCover < 92) {
      context.save();
      context.globalAlpha = clamp(1 - cloudCover / 115) * (celestialDay ? 0.9 : nightStrength);
      if (celestialDay) {
        rect(context, '#f6ca6f', celestialX - 3, celestialY - 3, 7, 7);
        rect(context, '#fff0a5', celestialX - 2, celestialY - 2, 5, 5);
      } else {
        rect(context, '#dce0d0', celestialX - 3, celestialY - 3, 7, 7);
        rect(context, palette[0], celestialX, celestialY - 3, 4, 5);
      }
      context.restore();
    }

    const cloudCount = Math.round(2 + cloudCover / 12);
    const windDirection = weather?.windDirection ?? 250;
    const windSign = windDirection >= 180 ? -1 : 1;
    for (let index = 0; index < cloudCount; index += 1) {
      const drift = this.reducedMotion ? 0 : time * (0.6 + (weather?.windSpeed ?? 8) / 35) * windSign;
      const x = 43 + ((((index * 43 + drift) % 230) + 230) % 230);
      const y = 30 + ((index * 17) % 39);
      const cloud = environment?.dayPhase === 'night' ? '#495269' : '#b4bdbe';
      context.save();
      context.globalAlpha = 0.28 + cloudCover / 180;
      rect(context, cloud, x, y, 20 + (index % 3) * 5, 4);
      rect(context, mixColor(cloud, '#eef0df', 0.28), x + 4, y - 2, 8 + (index % 2) * 5, 3);
      rect(context, mixColor(cloud, '#31384c', 0.25), x + 3, y + 4, 18, 1);
      context.restore();
    }

    for (let index = 0; index < 19; index += 1) {
      const x = 45 + index * 12 + ((index * 7) % 8);
      const height = 10 + ((index * 11) % 30);
      const width = 8 + (index % 4) * 2;
      const building = environment?.dayPhase === 'midday' || environment?.dayPhase === 'morning' ? '#586776' : '#292f43';
      rect(context, mixColor(building, '#171c2c', (index % 3) * 0.1), x, 88 - height, width, height + 15);
      rect(context, '#20283a', x + width - 1, 89 - height, 1, height + 13);
      for (let floor = 0; floor < 3; floor += 1) {
        if ((index + floor) % 3 === 0 && nightStrength > 0.2) {
          const lit = (index + floor) % 2 === 0 ? '#d3ad70' : '#9a8a70';
          rect(context, lit, x + 2 + (floor % 2) * 3, 84 - height + floor * 7, 1.5, 1);
          rect(context, '#f0c77c', x + 2.5 + (floor % 2) * 3, 84 - height + floor * 7, HALF_PIXEL, HALF_PIXEL);
        }
      }
    }

    this.drawOutsideLife(time);

    const wetness = clamp(((weather?.rain ?? 0) + (weather?.showers ?? 0)) / 4 + (weather?.kind === 'storm' ? 0.6 : 0));
    rect(context, mixColor('#5f6871', '#8295a2', wetness), 52, 93, 198, 1.5);
    rect(context, mixColor('#30394b', '#40596a', wetness), 52, 96, 198, 6);
    for (let index = 0; index < 20; index += 1) {
      const x = 54 + ((index * 31) % 192);
      const width = 1 + (index % 3) * HALF_PIXEL;
      const color = wetness > 0.1 && index % 4 === 0 ? '#d6a35f' : index % 4 === 1 ? '#8aa0ad' : '#52677c';
      rect(context, color, x, 95 + (index % 3), width, 5 - (index % 3));
      rect(context, '#303c50', x + width, 99.5, 3 + (index % 4), HALF_PIXEL);
    }

    const rainStrength = clamp(((weather?.rain ?? 0) + (weather?.showers ?? 0)) / 5 + (weather?.kind === 'storm' ? 0.55 : 0));
    const rainCount = Math.round((this.reducedMotion ? 12 : 42) * rainStrength);
    for (let index = 0; index < rainCount; index += 1) {
      const x = 53 + ((index * 43) % 196);
      const speed = this.reducedMotion ? 0 : 8 + (index % 5) * 3;
      const y = 20 + ((index * 19 + time * speed) % 82);
      rect(context, index % 3 ? '#8193a5' : '#bdc7cb', x, y, HALF_PIXEL, 2 + (index % 3));
    }

    const snowStrength = clamp((weather?.snowfall ?? 0) / 1.5);
    const snowCount = Math.round((this.reducedMotion ? 10 : 32) * snowStrength);
    for (let index = 0; index < snowCount; index += 1) {
      const drift = this.reducedMotion ? 0 : Math.sin(time * 0.8 + index) * (2 + (weather?.windSpeed ?? 0) / 18);
      const x = 53 + ((index * 47 + drift + 195) % 195);
      const y = 24 + ((index * 23 + (this.reducedMotion ? 0 : time * (2 + index % 3))) % 69);
      rect(context, index % 3 ? '#e3e6dc' : '#fff4dc', x, y, index % 4 === 0 ? 1 : HALF_PIXEL, index % 4 === 0 ? 1 : HALF_PIXEL);
    }

    const fogPresence = weather
      ? weather.kind === 'fog'
        ? weather.transitionProgress
        : weather.previousKind === 'fog'
          ? 1 - weather.transitionProgress
          : 0
      : 0;
    if (fogPresence > 0) {
      context.save();
      context.globalAlpha = (1 - fogVisibility) * fogPresence;
      rect(context, '#c3c7bd', 52, 47, 198, 14);
      rect(context, '#aeb8b4', 52, 67, 198, 19);
      rect(context, '#d0d0c4', 52, 85, 198, 12);
      context.restore();
    }

    const stormPresence = weather
      ? weather.kind === 'storm'
        ? weather.transitionProgress
        : weather.previousKind === 'storm'
          ? 1 - weather.transitionProgress
          : 0
      : 0;
    if (stormPresence > 0 && !this.reducedMotion && this.active && time % 19 < 0.12) {
      context.save();
      context.globalAlpha = 0.28 * stormPresence;
      rect(context, '#e8e9d2', 52, 24, 198, 78);
      context.restore();
    }

    // Dünne Fensterreflexe machen die große Glasfläche weniger flach, ohne das Wetter zu verdecken.
    context.save();
    context.globalAlpha = environment?.dayPhase === 'night' ? 0.08 : 0.16;
    for (const offset of [0, 61, 124]) {
      polygon(context, '#ffe5ad', [[59 + offset, 27], [69 + offset, 27], [119 + offset, 99], [109 + offset, 99]]);
      polygon(context, '#fff6d7', [[61 + offset, 28], [64 + offset, 28], [114 + offset, 99], [111 + offset, 99]]);
    }
    context.restore();
    context.restore();

    rect(context, '#ba7a58', 47, 19, 208, 4);
    rect(context, '#d49a68', 49, 20, 204, 1);
    rect(context, '#633f3e', 47, 101, 208, 7);
    rect(context, '#d39a69', 45, 106, 212, 4);
    rect(context, '#efb875', 48, 106, 205, 1);
    for (const x of [111, 179]) {
      rect(context, COLORS.ink, x, 21, 6, 83);
      rect(context, '#724640', x + 1, 23, 4, 79);
      rect(context, '#bd7857', x + 1.5, 24.5, 1, 76);
      rect(context, '#4c3236', x + 4.5, 23, HALF_PIXEL, 79);
    }
    rect(context, '#e3ae77', 51, 25, 1.5, 70);
    rect(context, '#68433f', 247, 25, 2, 70);

    if ((weather?.snowfall ?? 0) > 0.05) {
      rect(context, '#e7e6d7', 49, 101, 204, 4);
      rect(context, '#f8f2df', 55, 99.5, 32, 2);
      rect(context, '#cbd5d0', 180, 100, 45, 2);
    }

    const condensation = weather?.kind === 'rain' || weather?.kind === 'storm' || weather?.kind === 'fog'
      ? (this.reducedMotion ? 7 : 17)
      : 2;
    for (let index = 0; index < condensation; index += 1) {
      const x = 55 + ((index * 31) % 188);
      const y = 28 + ((index * 17) % 62);
      rect(context, '#bdc4c5', x, y, HALF_PIXEL, 1 + (index % 3) * HALF_PIXEL);
      rect(context, '#53677e', x, y + 1.5 + (index % 3) * HALF_PIXEL, HALF_PIXEL, HALF_PIXEL);
      if (index % 4 === 0) rect(context, '#d9d3c5', x - HALF_PIXEL, y, HALF_PIXEL, HALF_PIXEL);
    }
  }

  private drawOutsideLife(time: number): void {
    const context = this.context;
    const weather = this.environment?.weather;
    const date = this.environment?.localTime ?? new Date(2026, 6, 14);
    const month = date.getMonth();
    const season = month === 11 || month <= 1 ? 'winter' : month <= 4 ? 'spring' : month <= 7 ? 'summer' : 'autumn';
    this.canvas.dataset.season = season;

    const activeTime = this.active && !this.reducedMotion ? time : 0;
    const rain = weather?.kind === 'rain' || weather?.kind === 'storm';
    const snow = weather?.kind === 'snow';
    for (let index = 0; index < 3; index += 1) {
      const direction = index % 2 === 0 ? 1 : -1;
      const travel = ((activeTime * (2.2 + index * 0.42) * direction + index * 71) % 236 + 236) % 236;
      const x = 49 + travel;
      const ground = 96 + (index % 2) * 2;
      const coat = index === 0 ? '#8e5d56' : index === 1 ? '#52706f' : '#7b6a49';
      rect(context, '#222836', x - 2, ground - 11, 5, 10);
      rect(context, coat, x - 2.5, ground - 10, 6, 7);
      rect(context, '#d4a17d', x - 1.5, ground - 15, 4, 5);
      rect(context, '#30252c', x - 2, ground, 2, 1);
      rect(context, '#30252c', x + 1, ground, 2, 1);
      if (rain || snow) {
        rect(context, '#b6945a', x + 4, ground - 15, HALF_PIXEL, 14);
        polygon(context, rain ? '#536f7d' : '#d9ddd5', [[x - 2, ground - 14], [x + 4, ground - 20], [x + 10, ground - 14]]);
      }
    }

    const vehicleCycle = ((activeTime % 34) + 34) % 34;
    if (vehicleCycle < 11) {
      const x = 54 + vehicleCycle * 20;
      rect(context, '#303943', x, 82, 33, 12);
      rect(context, season === 'winter' ? '#8c5f52' : '#b86f52', x + 1, 83, 31, 8);
      rect(context, '#d5d2b7', x + 4, 84, 8, 3);
      rect(context, '#91adb4', x + 14, 84, 7, 3);
      rect(context, '#91adb4', x + 23, 84, 6, 3);
      rect(context, '#202631', x + 5, 92, 5, 2);
      rect(context, '#202631', x + 24, 92, 5, 2);
    }

    if (season === 'autumn') {
      for (let index = 0; index < 8; index += 1) {
        const drift = this.reducedMotion ? 0 : activeTime * (1.1 + index * 0.06);
        const x = 54 + ((index * 37 + drift) % 190);
        const y = 46 + ((index * 17 + drift * 0.4) % 45);
        rect(context, index % 2 ? '#c97b4e' : '#d3a350', x, y, 1.5, 1);
      }
    } else if (season === 'spring' || season === 'summer') {
      for (let index = 0; index < 4; index += 1) {
        const wing = this.reducedMotion ? 0 : Math.sin(activeTime * 5 + index) * HALF_PIXEL;
        const x = 63 + ((index * 53 + activeTime * 3) % 178);
        const y = 35 + (index % 2) * 10;
        rect(context, '#2d3442', x - 2, y + wing, 2, HALF_PIXEL);
        rect(context, '#2d3442', x + HALF_PIXEL, y - wing, 2, HALF_PIXEL);
      }
    }
  }

  private drawDoor(time: number): void {
    const context = this.context;
    const palette = skyPalette(this.environment?.dayPhase ?? 'night');
    rect(context, COLORS.ink, 3, 36, 43, 155);
    rect(context, '#704b46', 7, 41, 35, 146);
    rect(context, '#a46b54', 8, 42, 33, 2);
    rect(context, mixColor(palette[0], '#202538', 0.34), 11, 47, 27, 78);
    rect(context, mixColor(palette[1], '#37445b', 0.45), 13, 49, 23, 74);
    rect(context, mixColor(palette[2], '#526078', 0.55), 14, 50, 3, 72);
    rect(context, '#2b3145', 13, 96, 23, 27);
    rect(context, '#1f2638', 14, 99, 21, 23);
    for (let index = 0; index < 4; index += 1) {
      rect(context, index % 2 ? '#6e8198' : '#9aa8b7', 17 + index * 5, 53 + index * 13, HALF_PIXEL, 5);
    }
    rect(context, '#a46b50', 10, 127, 29, 5);
    rect(context, '#d08d60', 11, 128, 27, 1);
    rect(context, '#8c5a49', 10, 134, 29, 49);
    rect(context, '#734744', 13, 137, 23, 42);
    rect(context, '#9d6450', 14, 138, 21, 1);
    rect(context, '#59393d', 13, 179, 23, 2);
    rect(context, '#5f3c40', 16, 142, 16, 32);
    rect(context, '#7d5048', 17, 143, 14, 1);
    rect(context, '#9b6250', 18, 170, 12, 1);
    rect(context, '#3e2e35', 30, 141, 2, 29);
    rect(context, '#d5a266', 32, 143, 2, 9);
    rect(context, '#f4d18a', 32 + HALF_PIXEL, 144, HALF_PIXEL, 6);
    rect(context, '#d3b47a', 31, 152, 4, 2);
    rect(context, '#7f4b43', 32, 153 + HALF_PIXEL, 3, HALF_PIXEL);
    rect(context, COLORS.cream, 33, 139, 3, 3);
    rect(context, '#fff0bd', 34, 139.5, HALF_PIXEL, HALF_PIXEL);

    polygon(context, '#352b34', [[7, 187], [38, 187], [43, 193], [2, 193]]);
    rect(context, '#9d6552', 9, 188, 27, 3);
    rect(context, '#c58a61', 13, 189, 19, HALF_PIXEL);
    for (let x = 10; x < 36; x += 5) rect(context, '#d5a66b', x, 192, 2, HALF_PIXEL);

    rect(context, '#d8b16f', 17, 64, 15, 13);
    rect(context, '#f0d391', 18, 65, 13, 1);
    rect(context, '#5d3c3c', 19, 67, 11, 8);
    rect(context, '#e6cb91', 20, 68.5, 9, 1);
    rect(context, '#e6cb91', 22, 71.5, 5, HALF_PIXEL);
    rect(context, '#9c5f49', 20, 74, 9, HALF_PIXEL);

    this.drawWallClock();
    const rain = clamp(((this.environment?.weather.rain ?? 0) + (this.environment?.weather.showers ?? 0)) / 4);
    if (!this.active || rain <= 0) return;
    for (let index = 0; index < Math.round((this.reducedMotion ? 4 : 12) * rain); index += 1) {
      const y = 48 + ((index * 23 + time * (10 + index)) % 74);
      rect(context, index % 2 ? '#8594a6' : '#aeb8c2', 14 + ((index * 7) % 21), y, HALF_PIXEL, 2.5 + (index % 2));
    }
  }

  private drawWallClock(): void {
    const context = this.context;
    const date = this.environment?.localTime ?? new Date(0);
    const hours = date.getHours() % 12;
    const minutes = date.getMinutes();
    const hourAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
    const minuteAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
    const centerX = 25;
    const centerY = 26;
    rect(context, '#2a2028', centerX - 8, centerY - 8, 16, 16);
    rect(context, '#b57a56', centerX - 7, centerY - 7, 14, 14);
    rect(context, '#ead8ae', centerX - 5.5, centerY - 5.5, 11, 11);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      rect(context, '#75483e', centerX + Math.cos(angle) * 4.5 - HALF_PIXEL, centerY + Math.sin(angle) * 4.5 - HALF_PIXEL, 1, 1);
    }
    const drawHand = (angle: number, length: number, color: string): void => {
      const steps = Math.ceil(length * 2);
      for (let step = 1; step <= steps; step += 1) {
        const distance = (step / steps) * length;
        rect(context, color, centerX + Math.cos(angle) * distance - HALF_PIXEL, centerY + Math.sin(angle) * distance - HALF_PIXEL, 1, 1);
      }
    };
    drawHand(hourAngle, 3, '#4a3034');
    drawHand(minuteAngle, 4.5, '#7b4b40');
    rect(context, '#d39a60', centerX - HALF_PIXEL, centerY - HALF_PIXEL, 1, 1);
    this.canvas.dataset.clock = 'analog';
    this.canvas.dataset.clockTime = this.environment?.localTimeText ?? '00:00';
  }

  private drawArchitecture(time: number): void {
    const context = this.context;
    rect(context, COLORS.ink, 0, 7, WORLD_WIDTH, 8);
    rect(context, '#30242d', 0, 8, WORLD_WIDTH, 2);
    for (let x = 0; x < WORLD_WIDTH; x += 48) {
      rect(context, x % 96 === 0 ? '#392931' : '#473039', x, 10.5, 45, 3);
      rect(context, '#5e3d42', x + 1, 11, 42, HALF_PIXEL);
    }

    const lampsNeeded = clamp((12 - (this.environment?.solar.elevation ?? -12)) / 24);
    const glowBright = this.reducedMotion || Math.sin(time * 0.68) > -0.25;
    context.save();
    context.globalAlpha = 0.05 + lampsNeeded * 0.12;
    for (const x of [78, 150, 224, 302, 354]) {
      polygon(context, '#f4bf73', [[x - 16, 28], [x + 16, 28], [x + 35, 116], [x - 35, 116]]);
    }
    context.restore();
    for (const x of [78, 150, 224, 302, 354]) {
      rect(context, '#38282e', x, 0, 3, 18);
      rect(context, '#6d4541', x + HALF_PIXEL, 0, HALF_PIXEL, 17);
      rect(context, '#e4ac63', x - 5, 17, 13, 3);
      rect(context, '#ffd98d', x - 3, 18, 9, 1);
      rect(context, glowBright ? mixColor('#d88f57', COLORS.glow, lampsNeeded) : '#e0a260', x - 7, 20, 17, 4);
      rect(context, '#ffe1a0', x - 5, 20.5, 13, 1);
      rect(context, '#c77b4d', x - 5, 24, 13, 2);
      rect(context, '#8d5041', x - 3, 26, 9, HALF_PIXEL);
      for (const offset of [-10, -8, 10, 12]) rect(context, '#bd744b', x + offset, 27 + Math.abs(offset) * HALF_PIXEL, HALF_PIXEL, HALF_PIXEL);
    }

    rect(context, COLORS.ink, 267, 20, 103, 64);
    rect(context, '#2c252b', 271, 24, 95, 56);
    rect(context, '#423438', 273, 26, 91, 52);
    rect(context, '#5a4140', 275, 28, 87, 1);
    rect(context, '#714e47', 274, 29, 2, 47);
    rect(context, '#805649', 361, 29, 2, 47);
    rect(context, '#d59c63', 276, 30, 4, 2);
    rect(context, '#d59c63', 357, 30, 4, 2);
    rect(context, '#a96750', 276, 73, 4, 2);
    rect(context, '#a96750', 357, 73, 4, 2);
    rect(context, '#ead195', 282, 31, 15, 1);
    rect(context, '#a96b54', 299, 31, 23, HALF_PIXEL);
    const menuRows: readonly [number, number, number, string][] = [
      [280, 32, 30, '#e2bf82'], [280, 39, 63, '#c98b65'], [280, 46, 48, '#e2bf82'],
      [280, 53, 57, '#c98b65'], [280, 60, 34, '#e2bf82'], [280, 67, 68, '#c98b65'],
    ];
    for (const [x, y, width, color] of menuRows) {
      rect(context, color, x, y, width, 1);
      rect(context, '#8d6151', x + width + 3, y, 4, 1);
      rect(context, color, x + width + 9, y, HALF_PIXEL, 1);
    }
    for (const y of [35, 42, 49, 56, 63, 70]) {
      rect(context, '#6f4c48', 343, y, 9, HALF_PIXEL);
      rect(context, '#d49b65', 354, y, 3, HALF_PIXEL);
    }
    rect(context, '#aa6b52', 347, 31, 10, 11);
    rect(context, '#e0b477', 349, 33, 6, 5);
    rect(context, '#423438', 350, 34, 4, 3);
    rect(context, '#e0b477', 355, 34.5, 2, 1);
    rect(context, '#d19a67', 350, 39, 5, HALF_PIXEL);

    rect(context, '#50353c', 256, 89, 7, 43);
    rect(context, '#b77a55', 254, 87, 11, 4);
    rect(context, '#d59767', 255, 88, 9, 1);
    rect(context, '#6b483f', 257.5, 92, 4, 36);
    const wind = clamp((this.environment?.weather.windSpeed ?? 0) / 55);
    const plantSway = this.reducedMotion ? wind * 1.5 : Math.sin(time * (0.7 + wind)) * wind * 2.5;
    rect(context, '#4d6958', 258.5, 80, 3, 8);
    rect(context, '#72906a', 253 + plantSway, 81, 5, 5);
    rect(context, '#91a878', 254 + plantSway, 80, 2, 4);
    rect(context, '#6b855f', 262 + plantSway * 0.7, 78, 5, 9);
    rect(context, '#8da071', 264 + plantSway * 0.7, 77, 2, 6);
    rect(context, '#547359', 250 + plantSway * 0.4, 84, 5, 3);
    rect(context, '#5e795f', 266 + plantSway * 0.4, 84, 4, 3);
  }

  private drawFurnitureBack(): void {
    const context = this.context;
    rect(context, '#3a282f', 58, 138, 109, 6);
    rect(context, '#8d5845', 60, 135, 105, 6);
    rect(context, '#b27154', 62, 136, 101, 1);
    rect(context, '#72443f', 65, 139, 95, 2);
    for (const x of [74, 100, 126, 148]) {
      rect(context, '#6f4a48', x, 140, 19, 8);
      rect(context, '#a66a56', x + 1, 140.5, 17, HALF_PIXEL);
      rect(context, x % 2 ? '#b36f5b' : '#8f5c55', x + 3, 143, 13, 3);
      rect(context, '#d79b6b', x + 5, 143.5, 9, HALF_PIXEL);
    }
    for (const x of [68, 153]) {
      rect(context, '#50353a', x, 141, 4, 29);
      rect(context, '#6e4843', x + HALF_PIXEL, 142, HALF_PIXEL, 26);
    }
    for (let x = 75; x < 150; x += 13) rect(context, '#a76b4f', x, 137, HALF_PIXEL, 3);

    for (const x of [105, 179]) {
      rect(context, '#37272e', x - 18, 170, 37, 5);
      rect(context, COLORS.woodLight, x - 16, 167, 33, 4);
      rect(context, '#d0905f', x - 14, 167.5, 29, HALF_PIXEL);
      rect(context, '#74443d', x - 13, 171, 27, 1);
      rect(context, '#51343a', x - 2, 172, 4, 32);
      rect(context, '#724744', x - 1.5, 173, HALF_PIXEL, 29);
      rect(context, '#3b2930', x - 12, 202, 24, 3);
      rect(context, '#67413e', x - 9, 202, 18, HALF_PIXEL);
    }

    for (const x of [78, 130, 158, 207]) {
      rect(context, '#54363b', x, 177, 4, 25);
      rect(context, '#74483f', x - 3, 174, 10, 5);
      rect(context, '#aa6b4e', x - 2, 174, 8, 1);
      rect(context, '#382930', x + HALF_PIXEL, 181, 3, 21);
    }

    for (const x of [96, 169]) {
      rect(context, '#ead7b2', x, 163, 6, 4);
      rect(context, '#9a5c47', x + 1, 163, 4, 1);
      rect(context, '#ead7b2', x + 5.5, 164, 2, 2);
      rect(context, '#6a403c', x - 1, 167, 9, 1);
    }
    for (const [x, color] of [[75, '#d6b06c'], [151, '#7aa097']] as const) {
      rect(context, '#5f4544', x, 151, 12, 3);
      rect(context, color, x + 1, 149, 10, 3);
      rect(context, '#f0c77d', x + 3, 149.5, 6, HALF_PIXEL);
    }
  }

  private drawCounterBack(time: number): void {
    const context = this.context;

    rect(context, '#4d3338', 282, 89, 32, 27);
    rect(context, '#6f4942', 284, 92, 28, 23);
    rect(context, '#d09a67', 286, 95, 24, 17);
    rect(context, '#56383a', 288, 98, 20, 11);
    rect(context, '#f1ce87', 290, 100, 16, 1);
    const phase = this.environment?.dayPhase ?? 'night';
    const displayItems = phase === 'midday'
      ? [[290, 103, '#c7794e'], [294, 105, '#dca45e'], [298, 102, '#b9654a'], [302, 104, '#e0b66f'], [305, 102, '#d98957'], [307, 105, '#c7794e']] as const
      : phase === 'morning' || phase === 'dawn'
        ? [[291, 103, '#dca45e'], [296, 104, '#dca45e'], [301, 103, '#e0b66f'], [305, 105, '#c7794e']] as const
        : phase === 'afternoon'
          ? [[291, 103, '#a85e58'], [296, 104, '#d88d72'], [301, 102, '#8c5350'], [304, 105, '#e0b66f']] as const
          : [[294, 104, '#b9654a'], [302, 104, '#dca45e']] as const;
    for (const [x, y, color] of displayItems) {
      rect(context, '#3c2d32', x - 1, y + 2, 5, 1);
      rect(context, color, x, y, 3.5, 2.5);
      rect(context, '#f1cf8a', x + HALF_PIXEL, y, 2, HALF_PIXEL);
    }
    rect(context, '#b77a55', 285, 112, 26, 3);
    if (phase === 'night' || phase === 'evening') {
      rect(context, '#76a398', 286, 111, 9, 2);
      rect(context, '#d7caa8', 307, 108, 3, 7);
      rect(context, '#6d5b55', 308, 106, 1, 3);
    }

    rect(context, '#332c34', 322, 80, 40, 36);
    rect(context, '#4c4650', 324, 82, 36, 33);
    rect(context, '#858088', 326, 84, 32, 29);
    rect(context, '#aaa1a0', 328, 86, 28, 2);
    rect(context, '#302b32', 329, 88, 26, 12);
    rect(context, '#181920', 331, 90, 22, 7);
    rect(context, '#d7a55f', 333, 92, 3, 2);
    rect(context, '#e5bd72', 338, 92, HALF_PIXEL, 2);
    rect(context, '#8f3739', 344, 92, 3, 2);
    rect(context, '#b8544e', 349, 92, HALF_PIXEL, 2);
    rect(context, '#1f1e25', 330, 101, 7, 12);
    rect(context, '#1f1e25', 348, 101, 7, 12);
    rect(context, '#625b60', 332, 102, 3, 10);
    rect(context, '#625b60', 350, 102, 3, 10);
    rect(context, '#c9b6a0', 334, 110, 16, 5);
    rect(context, '#f4e5ca', 336, 108, 12, 4);
    rect(context, '#ffffff', 338, 108.5, 8, HALF_PIXEL);
    rect(context, '#3a3034', 340, 100, 5, 2);
    rect(context, '#b8aba2', 344, 100.5, 7, 1);

    for (const x of [290, 305, 367]) {
      rect(context, '#efe0bd', x, 110, 8, 6);
      rect(context, '#fff4d5', x + 1, 110.5, 6, HALF_PIXEL);
      rect(context, '#b87755', x + 7, 112, 3, 3);
      rect(context, '#8d604e', x, 116, 9, 2);
    }

    const steamCount = this.reducedMotion ? 2 : 5;
    for (let index = 0; index < steamCount; index += 1) {
      const rise = (time * (4 + index * 0.25) + index * 4) % 18;
      const x = 339 + (index % 3) * 2;
      rect(context, index % 2 ? '#c9bca9' : '#ead8b8', x, 107 - rise, HALF_PIXEL, 2);
      rect(context, '#9f9b93', x + HALF_PIXEL, 105.5 - rise, HALF_PIXEL, 1);
    }

    rect(context, COLORS.ink, 278, 118, 103, 8);
    rect(context, '#8a5345', 278, 116, 104, 5);
  }

  private drawCounterFront(): void {
    const context = this.context;
    rect(context, '#d3965f', 276, 116, 107, 7);
    rect(context, '#f0b776', 278, 116, 103, 1);
    rect(context, '#71453f', 278, 122, 104, 5);
    rect(context, COLORS.counter, 282, 126, 99, 81);
    rect(context, '#7f4e43', 287, 131, 89, 72);
    rect(context, '#965947', 289, 133, 85, 68);
    for (let x = 291; x < 375; x += 14) {
      rect(context, '#a9654d', x, 133, 2, 68);
      rect(context, '#c17b58', x + HALF_PIXEL, 134, HALF_PIXEL, 65);
      rect(context, '#74443f', x + 2, 134, 1, 65);
    }
    rect(context, '#c47c55', 288, 132, 87, 2);
    for (let x = 294; x < 370; x += 19) {
      rect(context, '#7c4a43', x, 140, 14, 52);
      rect(context, '#a9674e', x + 1, 141, 12, 1);
      rect(context, '#b87554', x + 2, 144, HALF_PIXEL, 45);
      rect(context, '#633c3d', x + 11, 143, 1, 47);
      rect(context, '#d49a64', x + 4, 166, 6, HALF_PIXEL);
    }
    rect(context, '#4c3338', 286, 193, 91, 4);
    rect(context, '#b97755', 290, 193, 83, HALF_PIXEL);
    rect(context, '#d1a86a', 298, 200, 67, 1.5);
    rect(context, '#7a5546', 299, 201.5, 65, HALF_PIXEL);
    for (const x of [303, 330, 357]) {
      rect(context, '#c8925e', x, 199, 2, 5);
      rect(context, '#f0c77b', x + HALF_PIXEL, 199, HALF_PIXEL, 4);
    }
    rect(context, '#6a403c', 288, 200, 87, 3);
    rect(context, '#4b3036', 278, 204, 106, 7);
    rect(context, '#6b4140', 281, 204, 99, 1);
    rect(context, '#2f242b', 276, 210, 108, 3);
  }

  private drawGuest(guest: Guest): void {
    const context = this.context;
    const x = snap(guest.position.x);
    const seated = guest.state === 'activity';
    const walking = guest.state.includes('walking') || guest.state === 'entering' || guest.state === 'exiting';
    const bob = this.reducedMotion || !walking ? 0 : Math.round(Math.sin(guest.animation) * 2) * HALF_PIXEL;
    const footY = snap(guest.position.y + bob);
    const bodyTop = footY - (seated ? 14.5 : 20.5);
    const facing = guest.facing;
    const variant = guestVariant(guest);
    const phase = this.reducedMotion ? 0 : Math.floor(guest.animation * 2) % 4;

    rect(context, '#2d2229', x - 7, footY + 1, 14, 2.5);
    rect(context, '#49313a', x - 5, footY + 1, 10, HALF_PIXEL);
    if (!seated) {
      const stride = this.reducedMotion ? 0 : Math.round(Math.sin(guest.animation)) * 2;
      rect(context, '#211d25', x - 4 + stride, footY - 5.5, 3.5, 7);
      rect(context, '#211d25', x + 1 - stride, footY - 5.5, 3.5, 7);
      rect(context, guest.palette.accent, x - 3.5 + stride, footY - 5, 2.5, HALF_PIXEL);
      rect(context, guest.palette.accent, x + 1.5 - stride, footY - 5, 2.5, HALF_PIXEL);
      rect(context, '#171820', x - 4.5 + stride, footY, 4.5, 1.5);
      rect(context, '#171820', x + 1 - stride, footY, 4.5, 1.5);
    }

    rect(context, COLORS.ink, x - 6.5, bodyTop - 1, 13, seated ? 13 : 16.5);
    polygon(context, guest.palette.coat, seated
      ? [[x - 5.5, bodyTop], [x + 5.5, bodyTop], [x + 6, bodyTop + 11.5], [x - 6, bodyTop + 11.5]]
      : [[x - 5.5, bodyTop], [x + 5.5, bodyTop], [x + 6, bodyTop + 15.5], [x - 6, bodyTop + 15.5]]);
    rect(context, guest.palette.accent, x + (facing > 0 ? 3.5 : -5.5), bodyTop + 4, 2, seated ? 7.5 : 10);
    rect(context, '#e7bb75', x - HALF_PIXEL, bodyTop + 1, 1, seated ? 10 : 13);
    rect(context, '#2c232a', x, bodyTop + 1, HALF_PIXEL, seated ? 10 : 13);
    rect(context, '#fff0bd', x - HALF_PIXEL, bodyTop + 2, HALF_PIXEL, HALF_PIXEL);
    rect(context, '#392933', x - 5, bodyTop + (seated ? 10 : 14), 10, 1.5);

    const headTop = bodyTop - 10;
    rect(context, COLORS.ink, x - 5.5, headTop, 11, 10);
    rect(context, guest.palette.skin, x - 4.5, headTop + 1, 9, 8);
    rect(context, '#f0c6a0', x + facing * 2, headTop + 2, 2, 1.5);
    rect(context, '#9b654f', x + facing * 4, headTop + 5, HALF_PIXEL, 1);
    rect(context, '#35252a', x + facing * 2, headTop + 3.5, 1, HALF_PIXEL);
    rect(context, '#8c4e47', x + facing * 2.5, headTop + 6.5, 1, HALF_PIXEL);
    rect(context, guest.palette.hair, x - 5.5, headTop - HALF_PIXEL, 11, 4);
    rect(context, '#1d1920', x - 4.5, headTop - HALF_PIXEL, 8, HALF_PIXEL);
    rect(context, guest.palette.hair, x - (facing > 0 ? 5.5 : 4.5), headTop + 2, facing > 0 ? 3 : 2, 6);
    rect(context, '#c88965', x + facing * 4.5, headTop + 4, 1.5, 2.5);

    if (variant === 0) {
      rect(context, '#24242b', x + facing * HALF_PIXEL, headTop + 3, 3, 1.5);
      rect(context, '#9eb0ad', x + facing, headTop + 3.5, 1, HALF_PIXEL);
    } else if (variant === 1) {
      rect(context, guest.palette.accent, x - 5.5, headTop - 2, 11, 3);
      rect(context, '#e9bb72', x - 4, headTop - 2.5, 8, HALF_PIXEL);
      rect(context, guest.palette.accent, x - 1, headTop - 3.5, 2, 1.5);
    } else if (variant === 2) {
      rect(context, guest.palette.hair, x - facing * 5, headTop, 3.5, 8);
      rect(context, '#1d1920', x - facing * 6, headTop - 1, 4, 4);
    } else if (variant === 3) {
      rect(context, guest.palette.accent, x - 5.5, bodyTop, 11, 2);
      rect(context, '#f0c978', x - facing * 5, bodyTop + 1, 2, 7);
    } else if (variant === 4) {
      rect(context, '#efc76f', x + facing * 5.5, headTop + 6, 1, 1.5);
    } else if (!seated) {
      rect(context, '#a66a4e', x - facing * 8, bodyTop + 8, 3, 8);
      rect(context, '#d5a269', x - facing * 7.5, bodyTop + 7, 2, 1);
    }

    const handY = bodyTop + 7 + (phase % 2) * HALF_PIXEL;
    rect(context, guest.palette.skin, x + facing * 5, handY, 2, 2);
    rect(context, '#f0c6a0', x + facing * 5.5, handY, HALF_PIXEL, HALF_PIXEL);

    if (guest.state === 'ordering') {
      const gesture = phase === 1 ? -2 : 0;
      rect(context, guest.palette.skin, x + 6, bodyTop + gesture, 2, 5);
      rect(context, '#f0dfba', x + 8, bodyTop - 4 + gesture, 5, 7);
      rect(context, '#a85e45', x + 9, bodyTop - 2 + gesture, 3, HALF_PIXEL);
      rect(context, '#d39a6b', x + 9, bodyTop, 2, HALF_PIXEL);
    }
    if (guest.state === 'waiting') {
      rect(context, '#ede0c7', x + facing * 6 - 2, bodyTop + 5, 5, 4);
      rect(context, '#fff3d2', x + facing * 6 - 1, bodyTop + 5, 3, HALF_PIXEL);
      rect(context, '#8d5947', x + facing * 6 - 1, bodyTop + 6, 3, HALF_PIXEL);
      rect(context, guest.palette.skin, x + facing * 5, bodyTop + 7, 2, 1.5);
    }
    if (guest.accessory === 'scarf') {
      rect(context, '#dfb65f', x - 5.5, bodyTop - 1.5, 11, 2.5);
      rect(context, '#bd704d', x - facing * 5, bodyTop, 2.5, 8);
    } else if (guest.accessory === 'coat') {
      rect(context, '#d3b27b', x - 1, bodyTop + 1, 2, seated ? 9 : 13);
      rect(context, '#4b3437', x - HALF_PIXEL, bodyTop + 3, 1, 1);
      rect(context, '#4b3437', x - HALF_PIXEL, bodyTop + 7, 1, 1);
    } else if (guest.accessory === 'sunglasses') {
      rect(context, '#20222a', x - 4.5, headTop + 3, 4, 2);
      rect(context, '#20222a', x + HALF_PIXEL, headTop + 3, 4, 2);
      rect(context, '#9eb4b2', x - 3.5, headTop + 3.5, 2, HALF_PIXEL);
      rect(context, '#9eb4b2', x + 1.5, headTop + 3.5, 2, HALF_PIXEL);
    } else if (guest.accessory === 'umbrella' && !seated) {
      const umbrellaX = x - facing * 8;
      rect(context, '#d6b36f', umbrellaX, bodyTop + 1, 1, 18);
      polygon(context, '#607b7c', [[umbrellaX - 3, bodyTop + 3], [umbrellaX, bodyTop - 1], [umbrellaX + 3, bodyTop + 3]]);
      rect(context, '#3d3036', umbrellaX, bodyTop + 18, 3, 1.5);
    }
    if (!seated) return;

    switch (guest.activity) {
      case 'reading': {
        const pageLift = phase === 2 ? -1 : 0;
        polygon(context, '#d7b779', [[x - 9, bodyTop + 5], [x - HALF_PIXEL, bodyTop + 7], [x + 9, bodyTop + 5 + pageLift], [x + 8, bodyTop + 11], [x, bodyTop + 10], [x - 8, bodyTop + 11]]);
        polygon(context, '#f0d99c', [[x - 8, bodyTop + 5.5], [x - 1, bodyTop + 7.5], [x - 1, bodyTop + 9.5], [x - 7, bodyTop + 9.5]]);
        polygon(context, '#ead092', [[x, bodyTop + 7.5], [x + 8, bodyTop + 5.5 + pageLift], [x + 7, bodyTop + 9.5], [x, bodyTop + 9.5]]);
        rect(context, '#875244', x - HALF_PIXEL, bodyTop + 7, 1, 4);
        rect(context, '#a06c55', x - 6, bodyTop + 7.5, 4, HALF_PIXEL);
        rect(context, '#a06c55', x + 2, bodyTop + 7.5, 4, HALF_PIXEL);
        rect(context, guest.palette.skin, x - 8, bodyTop + 9, 2, 1.5);
        rect(context, guest.palette.skin, x + 6, bodyTop + 9, 2, 1.5);
        break;
      }
      case 'typing': {
        const tap = phase % 2 ? HALF_PIXEL : 0;
        rect(context, '#25242d', x - 7, bodyTop + 2, 14, 8.5);
        rect(context, '#566975', x - 5.5, bodyTop + 3, 11, 5.5);
        rect(context, '#8da4a1', x - 4.5, bodyTop + 3.5, 9, HALF_PIXEL);
        rect(context, '#3f555f', x - 4.5, bodyTop + 4.5, 7, 3);
        rect(context, '#b4a883', x - 9, bodyTop + 10, 18, 2);
        rect(context, '#e0c98c', x - 7, bodyTop + 10, 14, HALF_PIXEL);
        rect(context, guest.palette.skin, x - 5 + tap, bodyTop + 9, 3, 1.5);
        rect(context, guest.palette.skin, x + 2 - tap, bodyTop + 9, 3, 1.5);
        rect(context, '#5b4b49', x - 3, bodyTop + 10.5, HALF_PIXEL, HALF_PIXEL);
        rect(context, '#5b4b49', x + 2, bodyTop + 10.5, HALF_PIXEL, HALF_PIXEL);
        break;
      }
      case 'talking': {
        const gesture = phase === 1 ? -3 : phase === 2 ? -1 : 0;
        rect(context, guest.palette.skin, x + facing * 5, bodyTop + 4 + gesture, 2, 4);
        rect(context, '#f0c6a0', x + facing * 6, bodyTop + 3.5 + gesture, 2, 2);
        rect(context, '#8c4e47', x + facing * 3, headTop + 6, phase % 2 ? 1.5 : HALF_PIXEL, HALF_PIXEL);
        if (!this.reducedMotion) {
          rect(context, '#e7d5ad', x + facing * 8, headTop - 3 + (phase === 3 ? -HALF_PIXEL : 0), 3, 1.5);
          rect(context, '#b98562', x + facing * 9, headTop - 2.5, HALF_PIXEL, HALF_PIXEL);
        }
        break;
      }
      case 'drinking': {
        const drinkPhase = this.reducedMotion ? 0 : Math.floor(guest.animation * 1.25) % 6;
        const lift = drinkPhase >= 2 && drinkPhase <= 4 ? -5 : 0;
        const cupX = x + facing * 6 - 2;
        const cupY = bodyTop + 6 + lift;
        rect(context, guest.palette.skin, x + facing * 4, bodyTop + 7 + lift * 0.7, 3, 2);
        rect(context, '#f1dfbd', cupX, cupY, 6, 5);
        rect(context, '#fff3d5', cupX + 1, cupY + HALF_PIXEL, 4, HALF_PIXEL);
        rect(context, '#9b634b', cupX + 1, cupY + 1, 4, HALF_PIXEL);
        rect(context, '#f1dfbd', cupX + (facing > 0 ? 5.5 : -1.5), cupY + 1.5, 2, 2);
        if (lift === 0) {
          rect(context, '#d4c8b3', cupX + 2, cupY - 2, HALF_PIXEL, 1.5);
          rect(context, '#eee0c8', cupX + 3, cupY - 3, HALF_PIXEL, 1.5);
        }
        break;
      }
      case 'phone': {
        const glow = phase % 2 === 0 ? '#88b6b0' : '#78a19f';
        rect(context, guest.palette.skin, x + facing * 3, bodyTop + 6, 4, 2);
        rect(context, '#252832', x + facing * 5 - 2, bodyTop + 1, 4, 8);
        rect(context, glow, x + facing * 5 - 1.5, bodyTop + 2, 3, 5);
        rect(context, '#d9e1cf', x + facing * 5 - 1, bodyTop + 2.5, 2, HALF_PIXEL);
        break;
      }
      case 'sketching': {
        polygon(context, '#ead7ae', [[x - 9, bodyTop + 6], [x + 7, bodyTop + 4], [x + 9, bodyTop + 11], [x - 7, bodyTop + 12]]);
        rect(context, '#8e6857', x - 5, bodyTop + 8, 8, HALF_PIXEL);
        rect(context, '#6c827c', x - 2, bodyTop + 9.5, 6, HALF_PIXEL);
        const pencilX = x + (phase % 2 ? 1 : -1);
        polygon(context, '#d9a653', [[pencilX, bodyTop + 4], [pencilX + 1, bodyTop + 3], [pencilX + 7, bodyTop + 9], [pencilX + 6, bodyTop + 10]]);
        rect(context, guest.palette.skin, pencilX - 1, bodyTop + 4, 3, 2);
        break;
      }
      case 'journaling': {
        const write = phase % 2 ? 1 : -1;
        polygon(context, '#d6af76', [[x - 8, bodyTop + 5], [x + 8, bodyTop + 5], [x + 7, bodyTop + 11], [x - 7, bodyTop + 11]]);
        rect(context, '#f3dfa7', x - 6, bodyTop + 6, 12, 4.5);
        rect(context, '#8f5947', x - HALF_PIXEL, bodyTop + 5.5, 1, 5);
        rect(context, '#8a674f', x - 4, bodyTop + 7, 4, HALF_PIXEL);
        rect(context, '#8a674f', x + 1, bodyTop + 8.5, 3, HALF_PIXEL);
        polygon(context, '#d9a653', [[x + write, bodyTop + 4], [x + 1 + write, bodyTop + 3], [x + 6 + write, bodyTop + 9], [x + 5 + write, bodyTop + 10]]);
        rect(context, guest.palette.skin, x - 1 + write, bodyTop + 4, 3, 2);
        break;
      }
      case 'knitting': {
        const stitch = phase % 2 ? 2 : 0;
        rect(context, '#b77869', x - 7, bodyTop + 7, 5, 5);
        rect(context, '#e5b668', x - 5, bodyTop + 8, 2, 2);
        rect(context, '#e5b668', x + 3, bodyTop + 8, 2, 2);
        rect(context, '#d8c8b3', x - 4, bodyTop + 6 + stitch, 10, HALF_PIXEL);
        rect(context, '#d8c8b3', x - 2, bodyTop + 4 - stitch, 8, HALF_PIXEL);
        rect(context, guest.palette.skin, x - 5, bodyTop + 6 + stitch, 3, 2);
        rect(context, guest.palette.skin, x + 4, bodyTop + 5 - stitch, 3, 2);
        rect(context, '#d39158', x - 10, bodyTop + 10, 3, 1);
        break;
      }
      case 'board-game': {
        rect(context, '#c89258', x - 9, bodyTop + 5, 18, 7);
        for (let row = 0; row < 2; row += 1) {
          for (let column = 0; column < 4; column += 1) {
            rect(context, (row + column) % 2 ? '#ead2a0' : '#81564a', x - 8 + column * 4, bodyTop + 6 + row * 3, 3.5, 2.5);
          }
        }
        rect(context, '#7c9d92', x - 5 + (phase % 2) * 2, bodyTop + 6.5, 2, 2);
        rect(context, '#b85f52', x + 3, bodyTop + 9, 2, 2);
        rect(context, guest.palette.skin, x + facing * 4, bodyTop + 7, 3, 2);
        break;
      }
    }
  }

  private drawBarista(barista: Barista, time: number): void {
    const context = this.context;
    const x = snap(barista.position.x);
    const y = snap(barista.position.y);
    const phase = this.reducedMotion ? 0 : Math.floor(barista.animation * 2) % 4;
    const bob = this.reducedMotion ? 0 : Math.round(Math.sin(barista.animation) * 2) * HALF_PIXEL;
    // Die Füße bleiben in Simulationskoordinaten; die angehobene Silhouette
    // lässt Kopf und Schultern eindeutig hinter der hohen Theke hervorschauen.
    const top = y - 29 + bob;
    const facing = barista.task === 'machine' ? 1 : barista.facing;

    rect(context, '#2b2228', x - 6.5, y - 1, 13, 2);
    rect(context, '#243136', x - 5, top + 14, 4, 11);
    rect(context, '#243136', x + 1, top + 14, 4, 11);
    rect(context, '#172126', x - 5.5, top + 23, 5, 2);
    rect(context, '#172126', x + HALF_PIXEL, top + 23, 5, 2);
    rect(context, '#2c2228', x - 6.5, top, 13, 14);
    rect(context, '#4f746d', x - 5.5, top + 1, 11, 12);
    rect(context, '#70938a', x - 4.5, top + 1.5, 9, HALF_PIXEL);
    rect(context, '#d9c4a4', x - 4.5, top + 7, 9, 7);
    polygon(context, '#ead8ba', [[x - 4, top + 8], [x + 4, top + 8], [x + 5, top + 17], [x - 5, top + 17]]);
    rect(context, '#bc8b68', x - 4, top + 16, 8, 1);
    rect(context, '#efc776', x - 3, top + 11, 6, 2);
    rect(context, '#fff0b8', x - 2, top + 11.5, 4, HALF_PIXEL);

    const headTop = top - 9;
    rect(context, '#2b2228', x - 5.5, headTop, 11, 10);
    rect(context, '#c88f68', x - 4.5, headTop + 1, 9, 8);
    rect(context, '#e7b184', x + facing, headTop + 2, 3, 2);
    rect(context, '#30252a', x - 5.5, headTop - 1, 11, 4);
    rect(context, '#15161c', x - 3.5, headTop - 1, 7, HALF_PIXEL);
    rect(context, '#30252a', x - (facing > 0 ? 5.5 : 4.5), headTop + 2, facing > 0 ? 3 : 2, 6);
    rect(context, '#242127', x + facing * 2, headTop + 3.5, 1, HALF_PIXEL);
    rect(context, '#8f4e46', x + facing * 3, headTop + 6.5, 1, HALF_PIXEL);
    rect(context, '#e6b58a', x + facing * 4.5, headTop + 4, 1.5, 2);
    rect(context, '#d8b16f', x - 5, headTop - 2, 10, 1.5);
    rect(context, '#f0ca7b', x - 3.5, headTop - 2.5, 7, HALF_PIXEL);

    const workY = 114;
    if (barista.task === 'wiping') {
      const wipe = phase < 2 ? -3 : 3;
      rect(context, '#4f746d', x + facing * 4, workY - 4, 7 + Math.abs(wipe), 3);
      rect(context, '#c88f68', x + facing * (9 + Math.abs(wipe)), workY - 3.5, 2, 2);
      rect(context, '#6c9b91', x + facing * (9 + wipe), workY - 1, 8, 2.5);
      rect(context, '#b5d3c8', x + facing * (9 + wipe), workY - 1, 6, HALF_PIXEL);
    } else if (barista.task === 'serving') {
      rect(context, '#4f746d', x - 8, workY - 5, 7, 3);
      rect(context, '#c88f68', x - 10, workY - 4.5, 3, 2);
      rect(context, '#413038', x - 14, workY - 1, 18, 1.5);
      rect(context, '#d49a63', x - 13, workY - 1.5, 16, HALF_PIXEL);
      for (const cupX of [x - 11, x - 4]) {
        rect(context, '#f0dfbd', cupX, workY - 6, 5, 5);
        rect(context, '#fff2d0', cupX + 1, workY - 5.5, 3, HALF_PIXEL);
        rect(context, '#9b6049', cupX + 1, workY - 5, 3, HALF_PIXEL);
        rect(context, '#f0dfbd', cupX + 4.5, workY - 4.5, 2, 2);
      }
    } else if (barista.task === 'grinding') {
      const crank = phase % 2 ? 2 : -2;
      rect(context, '#4f746d', x + 2, workY - 5, 8, 3);
      rect(context, '#c88f68', x + 9, workY - 4, 3, 2);
      rect(context, '#2b2b30', x + 11, workY - 12, 6, 11);
      rect(context, '#76726b', x + 12, workY - 11, 4, 4);
      rect(context, '#c88c55', x + 16, workY - 10, 8, HALF_PIXEL);
      rect(context, '#c88c55', x + 23 + crank, workY - 11.5, HALF_PIXEL, 4);
      rect(context, '#d4b078', x + 20 + crank, workY - 12.5, 6, 1);
      for (let index = 0; index < (this.reducedMotion ? 1 : 3); index += 1) {
        rect(context, '#8d6248', x + 14 + index * 2, workY - 2 - ((phase + index) % 2), HALF_PIXEL, HALF_PIXEL);
      }
    } else if (barista.task === 'restocking') {
      const lift = phase % 2 ? -2 : 0;
      rect(context, '#4f746d', x - 7, workY - 6 + lift, 7, 3);
      rect(context, '#c88f68', x - 9, workY - 6 + lift, 3, 2);
      rect(context, '#d69c61', x - 14, workY - 10 + lift, 7, 8);
      rect(context, '#f0c477', x - 13, workY - 9 + lift, 5, 1);
      rect(context, '#a75f48', x - 12, workY - 6 + lift, 3, 2);
    } else if (barista.task === 'polishing') {
      const polish = phase % 2 ? 2 : -2;
      rect(context, '#4f746d', x + 3, workY - 5, 8, 3);
      rect(context, '#c88f68', x + 10, workY - 4, 3, 2);
      rect(context, '#f0dfbd', x + 11 + polish, workY - 8, 6, 7);
      rect(context, '#b9d1c8', x + 9 + polish, workY - 4, 7, 3);
    } else if (barista.task === 'tasting') {
      const lift = phase % 3 === 1 ? -4 : 0;
      rect(context, '#4f746d', x + 3, workY - 5 + lift * 0.5, 8, 3);
      rect(context, '#c88f68', x + 10, workY - 4 + lift * 0.5, 3, 2);
      rect(context, '#f0dfbd', x + 12, workY - 6 + lift, 5, 5);
      rect(context, '#fff2d0', x + 13, workY - 5.5 + lift, 3, HALF_PIXEL);
      rect(context, '#9b6049', x + 13, workY - 5 + lift, 3, HALF_PIXEL);
      rect(context, '#f0dfbd', x + 16.5, workY - 4.5 + lift, 2, 2);
      if (lift === 0) rect(context, '#e4d4bd', x + 14, workY - 9, HALF_PIXEL, 2);
    } else {
      const reach = phase % 2 ? 1 : 0;
      rect(context, '#4f746d', x + 4, workY - 5, 10 + reach, 3);
      rect(context, '#c88f68', x + 13 + reach, workY - 4.5, 2.5, 2);
      rect(context, '#b8aba2', x + 14 + reach, workY - 2.5, 5, 2.5);
      rect(context, '#f0e6d5', x + 15 + reach, workY - 2.5, 3, HALF_PIXEL);
      rect(context, '#655d60', x + 13, workY - 3, 1.5, 1);
      if (this.active) {
        const steamRise = (time * 7) % 9;
        rect(context, '#e7d8c4', x + 17, workY - 4 - steamRise, HALF_PIXEL, 3);
        rect(context, '#bdb5a9', x + 18, workY - 6 - steamRise, HALF_PIXEL, 2);
      }
    }
  }

  private drawMoment(moment: Readonly<CafeMoment>): void {
    const context = this.context;
    const guests = moment.participantIds
      .map((id) => this.simulation.guests.find((guest) => guest.id === id))
      .filter((guest): guest is Guest => Boolean(guest));
    if (guests.length === 0) return;

    const centerX = guests.reduce((sum, guest) => sum + guest.position.x, 0) / guests.length;
    const averageY = guests.reduce((sum, guest) => sum + guest.position.y, 0) / guests.length;
    const tableY = averageY < 165 ? 139 : 169;
    const pulse = this.reducedMotion ? 0 : Math.sin(moment.elapsed * 4) * HALF_PIXEL;

    if (moment.kind === 'shared-cake') {
      rect(context, '#765046', centerX - 9, tableY - 3, 18, 2);
      rect(context, '#ead6aa', centerX - 7, tableY - 5, 14, 3);
      rect(context, '#b56356', centerX - 4, tableY - 8, 8, 4);
      rect(context, '#f2cb7d', centerX - 3, tableY - 9, 6, 1.5);
      rect(context, '#fff0bd', centerX - HALF_PIXEL, tableY - 12 + pulse, 1, 3);
      for (const guest of guests) {
        const direction = guest.position.x < centerX ? 1 : -1;
        rect(context, guest.palette.skin, guest.position.x + direction * 5, tableY - 7 + pulse, 3, 2);
      }
      return;
    }

    if (moment.kind === 'card-game') {
      rect(context, '#405d58', centerX - 11, tableY - 5, 22, 6);
      rect(context, '#92ad93', centerX - 10, tableY - 4.5, 20, HALF_PIXEL);
      for (let index = 0; index < 4; index += 1) {
        const x = centerX - 8 + index * 4.5;
        rect(context, index % 2 ? '#d6b16e' : '#f0dfba', x, tableY - 4 + (index % 2) * HALF_PIXEL, 3, 4);
        rect(context, '#8a5849', x + 1, tableY - 3, 1, 1);
      }
      const mover = guests[Math.floor(moment.elapsed * 1.6) % guests.length];
      if (mover) rect(context, mover.palette.skin, mover.position.x + mover.facing * 5, tableY - 7 + pulse, 3, 2);
      return;
    }

    const guest = guests[0];
    if (!guest) return;
    if (moment.kind === 'window-gaze') {
      rect(context, '#d9cda3', guest.position.x - 7, tableY - 4, 14, 2);
      rect(context, '#f0dfbd', guest.position.x - 3, tableY - 8, 6, 5);
      rect(context, '#9b6049', guest.position.x - 2, tableY - 7, 4, HALF_PIXEL);
      rect(context, '#f3dfa7', 67, 60, 1, 1 + pulse);
      rect(context, '#f3dfa7', 71, 65, 1, 1);
      return;
    }

    polygon(context, '#e7d2a7', [[guest.position.x - 10, tableY - 2], [guest.position.x + 8, tableY - 4], [guest.position.x + 10, tableY + 2], [guest.position.x - 8, tableY + 3]]);
    rect(context, '#5d766f', guest.position.x - 5, tableY - 1, 7, HALF_PIXEL);
    rect(context, '#bd7557', guest.position.x + 2, tableY - 2.5, 3, 2);
    rect(context, '#f0cf7e', guest.position.x + 6, tableY - 10 + pulse, 1, 3);
    rect(context, '#f0cf7e', guest.position.x + 6, tableY - 6, 3, 1);
  }

  private drawCafeDetails(time: number): void {
    const context = this.context;
    const month = (this.environment?.localTime ?? new Date(2026, 6, 14)).getMonth();
    const seasonal = month === 11 || month <= 1 ? '#d9e4dc' : month <= 4 ? '#d99b8d' : month <= 7 ? '#e1bd72' : '#c87955';
    const flicker = this.reducedMotion ? 0 : Math.sin(time * 2.2) * HALF_PIXEL;

    for (const [x, y] of [[105, 168], [179, 168]] as const) {
      rect(context, '#544149', x - 1, y - 7, 3, 5);
      rect(context, seasonal, x - 2, y - 9 + flicker, 5, 3);
      rect(context, '#f3d893', x - HALF_PIXEL, y - 12 + flicker, 1, 4);
      rect(context, '#fff0bd', x - HALF_PIXEL, y - 12.5 + flicker, 1, 1);
      rect(context, '#f0dfbd', x + 7, y - 5, 5, 4);
      rect(context, '#9b6049', x + 8, y - 4.5, 3, HALF_PIXEL);
      rect(context, '#f0dfbd', x + 11.5, y - 4, 2, 2);
      rect(context, '#3d3038', x - 13, y - 4, 7, 4);
      rect(context, x % 2 === 0 ? '#c17157' : '#5f7b77', x - 12, y - 3.5, 5, HALF_PIXEL);
    }

    rect(context, '#f0e0bd', 365, 108, 8, 5);
    rect(context, '#bf7b52', 366, 109, 6, HALF_PIXEL);
    rect(context, '#5f766d', 366, 111, 4, HALF_PIXEL);
    rect(context, '#e2bc72', 353, 36, 2, 2);
    rect(context, '#e2bc72', 351.5, 37, 5, HALF_PIXEL);
    rect(context, '#513a3d', 275, 106, 11, 9);
    rect(context, '#d7a566', 276, 105, 9, 3);
    rect(context, '#f3d28a', 278, 103, 5, 3);
    rect(context, '#b65e4e', 279, 102, 3, 2);
    rect(context, '#e8bf72', 282, 102, 2, 2);
    rect(context, '#f7e6bf', 280, 101, 2, 1);
    rect(context, '#4e695a', 366, 94, 4, 12);
    rect(context, '#71916b', 362, 93, 7, 6);
    rect(context, '#8fa778', 366, 91, 5, 7);
    rect(context, '#5b785d', 370, 96, 5, 5);
    rect(context, '#d1a066', 365, 105, 7, 3);
    rect(context, '#7c5145', 366, 108, 5, HALF_PIXEL);
    for (const [x, y] of [[48, 197], [239, 202], [249, 193]] as const) {
      rect(context, '#805345', x, y, 6, 5);
      rect(context, '#b77a53', x + 1, y - 1, 4, 2);
      rect(context, '#d6b06b', x + 2, y + 1, 2, 2);
    }
    for (let index = 0; index < 5; index += 1) {
      const x = 92 + index * 27;
      rect(context, index % 2 ? '#d7ae6b' : '#c58d5b', x, 205.5, 1.5, HALF_PIXEL);
    }
  }

  private drawFurnitureFront(): void {
    const context = this.context;
    for (const x of [105, 179]) {
      rect(context, '#33242b', x - 17, 172, 35, 3);
      rect(context, '#a66b4b', x - 15, 169, 31, 3);
      rect(context, '#d28b5b', x - 13, 169, 27, HALF_PIXEL);
      rect(context, '#70433e', x - 13, 171.5, 27, HALF_PIXEL);
    }
    rect(context, '#33242a', 55, 204, 176, 4);
    rect(context, '#6d4542', 58, 204, 170, HALF_PIXEL);
  }

  private drawAccident(accident: Readonly<CafeAccident>): void {
    if (accident.kind === 'tray-drop') this.drawTrayDrop(accident);
    else if (accident.kind === 'coffee-spill') this.drawCoffeeSpill(accident);
    else this.drawUmbrellaPop(accident);

    const participantId = accident.guestId ?? accident.witnessId;
    const guest = this.simulation.guests.find((item) => item.id === participantId);
    if (guest) this.drawReactionPose(guest, accident);
  }

  private drawTrayDrop(accident: Readonly<CafeAccident>): void {
    const context = this.context;
    const x = snap(accident.position.x);
    const y = snap(accident.position.y);
    const progress = Math.min(1, accident.phaseElapsed / Math.max(0.001, accident.phaseDuration));

    if (accident.phase === 'startle' && !this.reducedMotion) {
      const flightY = y - 23 + progress * 20;
      polygon(context, '#372932', [[x - 12, flightY], [x + 11, flightY + 4], [x + 9, flightY + 7], [x - 13, flightY + 3]]);
      rect(context, '#d09561', x - 10, flightY + HALF_PIXEL, 19, 1);
      rect(context, '#f2e1bd', x - 6 + progress * 3, flightY - 5 + progress * 2, 5, 5);
      rect(context, '#f2e1bd', x + 3 + progress * 5, flightY - 4 + progress * 4, 5, 5);
      return;
    }

    polygon(context, '#30242c', [[x - 13, y + 4], [x + 12, y], [x + 14, y + 3], [x - 11, y + 7]]);
    rect(context, '#ca8a5b', x - 10, y + 4, 20, 1);
    const shardCount = accident.phase === 'cleanup' ? Math.max(2, 8 - Math.floor(progress * 6)) : 8;
    for (let index = 0; index < shardCount; index += 1) {
      const shardX = x - 17 + ((index * 11) % 34);
      const shardY = y + 8 + ((index * 7) % 9);
      polygon(context, index % 2 ? '#f7e8c9' : '#c9d3cf', [[shardX, shardY], [shardX + 2, shardY - 2], [shardX + 3, shardY + 1]]);
    }
    if (!this.reducedMotion && accident.phase === 'chaos') {
      for (let index = 0; index < 5; index += 1) {
        const arc = (index - 2) * 5;
        rect(context, '#f3dfba', x + arc, y - 4 - ((index + Math.floor(progress * 6)) % 4) * 2, HALF_PIXEL, 2);
      }
    }
    if (accident.phase === 'cleanup') {
      const sweep = this.reducedMotion ? 0 : Math.sin(accident.phaseElapsed * 12) * 5;
      polygon(context, '#8b5a43', [[x + 11 + sweep, y - 25], [x + 13 + sweep, y - 25], [x + 2 + sweep, y + 8], [x, y + 8]]);
      rect(context, '#d2ad6d', x - 3 + sweep, y + 7, 10, 3);
    }
  }

  private drawCoffeeSpill(accident: Readonly<CafeAccident>): void {
    const context = this.context;
    const x = snap(accident.position.x);
    const tableY = accident.position.y < 165 ? 139 : 169;
    const progress = Math.min(1, accident.phaseElapsed / Math.max(0.001, accident.phaseDuration));
    const spillWidth = accident.phase === 'startle' ? 4 + progress * 6 : accident.phase === 'cleanup' ? 14 - progress * 8 : 14;

    polygon(context, '#6f3d31', [[x - spillWidth, tableY], [x - 2, tableY - 2], [x + spillWidth, tableY - HALF_PIXEL], [x + 5, tableY + 2], [x - 7, tableY + 1.5]]);
    rect(context, '#b56a45', x - spillWidth + 2, tableY - HALF_PIXEL, Math.max(2, spillWidth), HALF_PIXEL);
    const cupTilt = accident.phase === 'startle' && !this.reducedMotion ? progress * 4 : 4;
    polygon(context, '#efe0c0', [[x + 5, tableY - 6 + cupTilt], [x + 11, tableY - 4 + cupTilt], [x + 9, tableY + cupTilt], [x + 3, tableY - 2 + cupTilt]]);
    rect(context, '#8e5845', x + 5, tableY - 4 + cupTilt, 5, HALF_PIXEL);
    if (!this.reducedMotion && accident.phase === 'chaos') {
      for (let index = 0; index < 6; index += 1) {
        const dropX = x - 10 + index * 4;
        const dropY = tableY - 5 - ((index * 3 + Math.floor(progress * 8)) % 7);
        rect(context, '#9b563b', dropX, dropY, HALF_PIXEL, 1 + (index % 2));
      }
    }
    if (accident.phase === 'cleanup') {
      const wipe = this.reducedMotion ? 0 : Math.round(Math.sin(accident.phaseElapsed * 15) * 4);
      rect(context, '#6d9c92', x - 8 + wipe, tableY - 3, 13, 4);
      rect(context, '#b6d3c8', x - 6 + wipe, tableY - 3, 9, HALF_PIXEL);
    }
  }

  private drawUmbrellaPop(accident: Readonly<CafeAccident>): void {
    const context = this.context;
    const guest = this.simulation.guests.find((item) => item.id === accident.guestId);
    if (!guest) return;
    const x = snap(guest.position.x + guest.facing * 3);
    const y = snap(guest.position.y - 24);
    const progress = Math.min(1, accident.phaseElapsed / Math.max(0.001, accident.phaseDuration));
    const open = accident.phase === 'cleanup' ? Math.max(0.25, 1 - progress) : this.reducedMotion ? 1 : Math.min(1, progress * 2.4 + 0.2);
    const width = 5 + open * 18;

    polygon(context, '#302733', [[x - width, y], [x - width * 0.55, y - 7 * open], [x, y - 10 * open], [x + width * 0.55, y - 7 * open], [x + width, y], [x, y + 2]]);
    polygon(context, '#738b8a', [[x - width + 1, y - HALF_PIXEL], [x - width * 0.5, y - 6 * open], [x, y + 1], [x, y - 9 * open]]);
    polygon(context, '#b46e55', [[x, y - 9 * open], [x + width * 0.5, y - 6 * open], [x + width - 1, y - HALF_PIXEL], [x, y + 1]]);
    rect(context, '#e3bd76', x - HALF_PIXEL, y - 8 * open, 1, 20);
    rect(context, '#49313a', x, y + 11, 4, 1.5);
    if (!this.reducedMotion && accident.phase === 'chaos') {
      for (let index = 0; index < 5; index += 1) {
        const angle = accident.phaseElapsed * 8 + index * 1.2;
        rect(context, '#d8c38e', x + Math.cos(angle) * (width + 3), y + Math.sin(angle) * 7, HALF_PIXEL, HALF_PIXEL);
      }
    }
  }

  private drawReactionPose(guest: Guest, accident: Readonly<CafeAccident>): void {
    const context = this.context;
    const x = snap(guest.position.x);
    const seated = guest.state === 'activity';
    const footY = snap(guest.position.y);
    const shoulderY = footY - (seated ? 12 : 18);

    if (accident.phase === 'startle' || (accident.kind === 'tray-drop' && accident.phase === 'chaos')) {
      polygon(context, guest.palette.coat, [[x - 5, shoulderY], [x - 10, shoulderY - 7], [x - 8, shoulderY - 9], [x, shoulderY - 2]]);
      polygon(context, guest.palette.coat, [[x + 5, shoulderY], [x + 10, shoulderY - 7], [x + 8, shoulderY - 9], [x, shoulderY - 2]]);
      rect(context, guest.palette.skin, x - 11, shoulderY - 10, 3, 3);
      rect(context, guest.palette.skin, x + 8, shoulderY - 10, 3, 3);
      rect(context, '#f7d985', x - HALF_PIXEL, shoulderY - 23, 1, 5);
      rect(context, '#f7d985', x - HALF_PIXEL, shoulderY - 16, 1, 1);
    }

    if (accident.kind === 'coffee-spill' && accident.phase === 'cleanup') {
      const tableY = guest.position.y < 165 ? 139 : 169;
      rect(context, guest.palette.skin, x + guest.facing * 5, tableY - 5, 3, 2);
    }
  }

  private drawForeground(time: number): void {
    const context = this.context;
    rect(context, '#38282f', 0, 211, WORLD_WIDTH, 5);
    rect(context, '#211b24', 0, 215, WORLD_WIDTH, 1);
    for (let index = 0; index < 12; index += 1) {
      const x = 10 + index * 34;
      rect(context, index % 2 ? '#6c4644' : '#795047', x, 207, 15, HALF_PIXEL);
      rect(context, '#4e363b', x + 3, 209, 8, HALF_PIXEL);
      rect(context, '#9b6250', x + 5, 207.5, 4, HALF_PIXEL);
    }

    if (!this.active) return;
    const motes = this.reducedMotion ? 3 : 14;
    for (let index = 0; index < motes; index += 1) {
      const x = 57 + ((index * 41) % 296) + Math.sin(time * 0.3 + index) * 2;
      const y = 32 + ((index * 23 + time * (index % 3 + 0.5)) % 132);
      rect(context, index % 2 ? '#e1b16c' : '#c78c58', x, y, HALF_PIXEL, HALF_PIXEL);
      if (index % 5 === 0) rect(context, '#f2c87d', x + HALF_PIXEL, y - HALF_PIXEL, HALF_PIXEL, HALF_PIXEL);
    }
  }
}
