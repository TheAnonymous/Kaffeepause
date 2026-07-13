import { CafeCamera } from './camera';
import { CafeSimulation } from './simulation/cafeSimulation';
import { WORLD_HEIGHT, WORLD_WIDTH } from './simulation/layout';
import type { Barista, Guest } from './simulation/types';

export const RENDER_SCALE = 2;

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

export class CafeRenderer {
  private readonly context: CanvasRenderingContext2D;
  private reducedMotion = false;
  private active = false;

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

    context.save();
    context.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, -cameraX * RENDER_SCALE, 0);
    context.imageSmoothingEnabled = false;
    this.drawRoom(time);
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
    this.drawForeground(time);
    context.restore();
    this.canvas.dataset.cameraX = this.camera.x.toFixed(1);
    this.canvas.dataset.guestCount = String(this.simulation.guests.length);
  }

  private drawRoom(time: number): void {
    const context = this.context;
    rect(context, COLORS.deepest, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    rect(context, COLORS.wallDark, 0, 9, WORLD_WIDTH, 126);
    rect(context, COLORS.wall, 0, 14, WORLD_WIDTH, 101);
    rect(context, '#9b6554', 0, 93, WORLD_WIDTH, 22);
    rect(context, COLORS.wallLight, 0, 115, WORLD_WIDTH, 18);
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
  }

  private drawWindows(time: number): void {
    const context = this.context;
    rect(context, '#201a24', 47, 19, 208, 90);
    rect(context, '#86584d', 48.5, 20.5, 205, 87);
    rect(context, '#3c4057', 52, 24, 198, 78);

    context.save();
    context.beginPath();
    context.rect(52, 24, 198, 78);
    context.clip();

    rect(context, '#2b3349', 52, 24, 198, 78);
    rect(context, '#343d54', 52, 47, 198, 55);
    rect(context, '#48556d', 52, 67, 198, 35);
    rect(context, '#252d40', 52, 86, 198, 16);

    for (let index = 0; index < 19; index += 1) {
      const x = 45 + index * 12 + ((index * 7) % 8);
      const height = 10 + ((index * 11) % 30);
      const width = 8 + (index % 4) * 2;
      rect(context, index % 3 === 0 ? '#292d43' : index % 3 === 1 ? '#34394e' : '#30364b', x, 88 - height, width, height + 15);
      rect(context, '#20283a', x + width - 1, 89 - height, 1, height + 13);
      for (let floor = 0; floor < 3; floor += 1) {
        if ((index + floor) % 3 === 0) {
          const lit = (index + floor) % 2 === 0 ? '#d3ad70' : '#9a8a70';
          rect(context, lit, x + 2 + (floor % 2) * 3, 84 - height + floor * 7, 1.5, 1);
          rect(context, '#f0c77c', x + 2.5 + (floor % 2) * 3, 84 - height + floor * 7, HALF_PIXEL, HALF_PIXEL);
        }
      }
    }

    rect(context, '#66778b', 52, 93, 198, 1.5);
    rect(context, '#30394b', 52, 96, 198, 6);
    for (let index = 0; index < 20; index += 1) {
      const x = 54 + ((index * 31) % 192);
      const width = 1 + (index % 3) * HALF_PIXEL;
      const color = index % 4 === 0 ? '#d6a35f' : index % 4 === 1 ? '#8aa0ad' : '#52677c';
      rect(context, color, x, 95 + (index % 3), width, 5 - (index % 3));
      rect(context, '#303c50', x + width, 99.5, 3 + (index % 4), HALF_PIXEL);
    }

    const farRain = this.reducedMotion ? 10 : 24;
    for (let index = 0; index < farRain; index += 1) {
      const x = 53 + ((index * 43) % 196);
      const speed = 3 + (index % 4) * 1.5;
      const y = 20 + ((index * 19 + time * speed) % 82);
      rect(context, index % 3 ? '#5f7188' : '#7d8da0', x, y, HALF_PIXEL, 1.5 + (index % 3) * HALF_PIXEL);
    }

    const nearRain = this.reducedMotion ? 8 : 26;
    for (let index = 0; index < nearRain; index += 1) {
      const baseX = 53 + ((index * 47) % 195);
      const speed = 8 + (index % 5) * 3;
      const y = 20 + ((index * 29 + time * speed) % 88);
      rect(context, index % 4 ? '#8392a4' : '#b2bdc7', baseX, y, HALF_PIXEL, index % 3 === 0 ? 4.5 : 2.5);
      if (index % 5 === 0) rect(context, '#52677e', baseX + HALF_PIXEL, y + 3, HALF_PIXEL, 2);
    }
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

    const condensation = this.reducedMotion ? 7 : 17;
    for (let index = 0; index < condensation; index += 1) {
      const x = 55 + ((index * 31) % 188);
      const y = 28 + ((index * 17) % 62);
      rect(context, '#bdc4c5', x, y, HALF_PIXEL, 1 + (index % 3) * HALF_PIXEL);
      rect(context, '#53677e', x, y + 1.5 + (index % 3) * HALF_PIXEL, HALF_PIXEL, HALF_PIXEL);
      if (index % 4 === 0) rect(context, '#d9d3c5', x - HALF_PIXEL, y, HALF_PIXEL, HALF_PIXEL);
    }
  }

  private drawDoor(time: number): void {
    const context = this.context;
    rect(context, COLORS.ink, 3, 36, 43, 155);
    rect(context, '#704b46', 7, 41, 35, 146);
    rect(context, '#a46b54', 8, 42, 33, 2);
    rect(context, '#31384d', 11, 47, 27, 78);
    rect(context, '#465269', 13, 49, 23, 74);
    rect(context, '#526078', 14, 50, 3, 72);
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
    rect(context, COLORS.cream, 33, 139, 3, 3);
    rect(context, '#fff0bd', 34, 139.5, HALF_PIXEL, HALF_PIXEL);

    rect(context, '#d8b16f', 17, 64, 15, 13);
    rect(context, '#f0d391', 18, 65, 13, 1);
    rect(context, '#5d3c3c', 19, 67, 11, 8);
    rect(context, '#e6cb91', 20, 68.5, 9, 1);
    rect(context, '#e6cb91', 22, 71.5, 5, HALF_PIXEL);
    rect(context, '#9c5f49', 20, 74, 9, HALF_PIXEL);

    if (!this.active) return;
    for (let index = 0; index < (this.reducedMotion ? 3 : 8); index += 1) {
      const y = 48 + ((index * 23 + time * (10 + index)) % 74);
      rect(context, index % 2 ? '#8594a6' : '#aeb8c2', 14 + ((index * 7) % 21), y, HALF_PIXEL, 2.5 + (index % 2));
    }
  }

  private drawArchitecture(time: number): void {
    const context = this.context;
    rect(context, COLORS.ink, 0, 7, WORLD_WIDTH, 8);
    rect(context, '#30242d', 0, 8, WORLD_WIDTH, 2);
    for (let x = 0; x < WORLD_WIDTH; x += 48) {
      rect(context, x % 96 === 0 ? '#392931' : '#473039', x, 10.5, 45, 3);
      rect(context, '#5e3d42', x + 1, 11, 42, HALF_PIXEL);
    }

    const glowBright = this.reducedMotion || Math.sin(time * 0.68) > -0.25;
    for (const x of [78, 150, 224, 302, 354]) {
      rect(context, '#38282e', x, 0, 3, 18);
      rect(context, '#6d4541', x + HALF_PIXEL, 0, HALF_PIXEL, 17);
      rect(context, '#e4ac63', x - 5, 17, 13, 3);
      rect(context, '#ffd98d', x - 3, 18, 9, 1);
      rect(context, glowBright ? COLORS.glow : '#e9b66c', x - 7, 20, 17, 4);
      rect(context, '#ffe1a0', x - 5, 20.5, 13, 1);
      rect(context, '#c77b4d', x - 5, 24, 13, 2);
      rect(context, '#8d5041', x - 3, 26, 9, HALF_PIXEL);
      for (const offset of [-10, -8, 10, 12]) rect(context, '#bd744b', x + offset, 27 + Math.abs(offset) * HALF_PIXEL, HALF_PIXEL, HALF_PIXEL);
    }

    rect(context, COLORS.ink, 267, 20, 103, 64);
    rect(context, '#2c252b', 271, 24, 95, 56);
    rect(context, '#423438', 273, 26, 91, 52);
    rect(context, '#5a4140', 275, 28, 87, 1);
    const menuRows: readonly [number, number, number, string][] = [
      [280, 32, 30, '#e2bf82'], [280, 39, 63, '#c98b65'], [280, 46, 48, '#e2bf82'],
      [280, 53, 57, '#c98b65'], [280, 60, 34, '#e2bf82'], [280, 67, 68, '#c98b65'],
    ];
    for (const [x, y, width, color] of menuRows) {
      rect(context, color, x, y, width, 1);
      rect(context, '#8d6151', x + width + 3, y, 4, 1);
      rect(context, color, x + width + 9, y, HALF_PIXEL, 1);
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
    rect(context, '#4d6958', 258.5, 80, 3, 8);
    rect(context, '#72906a', 253, 81, 5, 5);
    rect(context, '#91a878', 254, 80, 2, 4);
    rect(context, '#6b855f', 262, 78, 5, 9);
    rect(context, '#8da071', 264, 77, 2, 6);
    rect(context, '#547359', 250, 84, 5, 3);
    rect(context, '#5e795f', 266, 84, 4, 3);
  }

  private drawFurnitureBack(): void {
    const context = this.context;
    rect(context, '#3a282f', 58, 138, 109, 6);
    rect(context, '#8d5845', 60, 135, 105, 6);
    rect(context, '#b27154', 62, 136, 101, 1);
    rect(context, '#72443f', 65, 139, 95, 2);
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
  }

  private drawCounterBack(time: number): void {
    const context = this.context;

    rect(context, '#4d3338', 282, 89, 32, 27);
    rect(context, '#6f4942', 284, 92, 28, 23);
    rect(context, '#d09a67', 286, 95, 24, 17);
    rect(context, '#56383a', 288, 98, 20, 11);
    rect(context, '#f1ce87', 290, 100, 16, 1);
    for (const [x, y, color] of [[291, 103, '#c7794e'], [296, 104, '#dca45e'], [301, 102, '#b9654a'], [304, 105, '#e0b66f']] as const) {
      rect(context, '#3c2d32', x - 1, y + 2, 5, 1);
      rect(context, color, x, y, 3.5, 2.5);
      rect(context, '#f1cf8a', x + HALF_PIXEL, y, 2, HALF_PIXEL);
    }
    rect(context, '#b77a55', 285, 112, 26, 3);

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
