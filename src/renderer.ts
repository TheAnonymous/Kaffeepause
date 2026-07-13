import { CafeCamera } from './camera';
import { CafeSimulation } from './simulation/cafeSimulation';
import { WORLD_HEIGHT, WORLD_WIDTH } from './simulation/layout';
import type { Barista, Guest } from './simulation/types';

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

function rect(context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number): void {
  context.fillStyle = color;
  context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function polygon(context: CanvasRenderingContext2D, color: string, points: readonly [number, number][]): void {
  const first = points[0];
  if (!first) return;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(first[0], first[1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  context.closePath();
  context.fill();
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
    const logicalWidth = mobile
      ? Math.max(112, Math.min(210, Math.round(WORLD_HEIGHT * aspect)))
      : WORLD_WIDTH;
    this.canvas.width = logicalWidth;
    this.canvas.height = WORLD_HEIGHT;
    this.context.imageSmoothingEnabled = false;
    this.canvas.dataset.logicalWidth = String(logicalWidth);
    this.canvas.dataset.particles = reducedMotion ? 'low' : 'full';
    this.camera.configure(logicalWidth, mobile, reducedMotion);
    this.canvas.dataset.cameraMode = this.camera.mode;
  }

  render(elapsed: number): void {
    const time = this.active ? elapsed : 0;
    const context = this.context;
    context.save();
    context.translate(-Math.round(this.camera.x), 0);
    this.drawRoom(time);
    this.drawWindows(time);
    this.drawDoor(time);
    this.drawArchitecture();
    this.drawFurnitureBack();
    this.drawCounter(time);
    this.drawBarista(this.simulation.barista);

    const guests = [...this.simulation.guests].sort((left, right) => left.position.y - right.position.y);
    for (const guest of guests) this.drawGuest(guest, time);

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
    rect(context, COLORS.wall, 0, 14, WORLD_WIDTH, 116);
    rect(context, COLORS.wallLight, 0, 115, WORLD_WIDTH, 18);
    rect(context, COLORS.ink, 0, 130, WORLD_WIDTH, 4);
    rect(context, COLORS.floor, 0, 134, WORLD_WIDTH, 82);

    for (let y = 137; y < WORLD_HEIGHT; y += 13) {
      rect(context, y % 26 === 7 ? '#5b3d40' : COLORS.floorLight, 0, y, WORLD_WIDTH, 1);
    }
    for (let x = -40; x < WORLD_WIDTH + 40; x += 31) {
      polygon(context, '#3d2d34', [[x, 216], [x + 2, 216], [x + 54, 134], [x + 52, 134]]);
    }

    const flicker = this.reducedMotion ? 0 : Math.sin(time * 1.3) > 0.92 ? 1 : 0;
    rect(context, flicker ? '#ce8254' : '#d99157', 0, 112, WORLD_WIDTH, 3);
    rect(context, '#f0b764', 58, 116, 196, 2);
  }

  private drawWindows(time: number): void {
    const context = this.context;
    rect(context, COLORS.ink, 48, 20, 206, 88);
    rect(context, '#3c4057', 53, 25, 196, 76);

    context.save();
    context.beginPath();
    context.rect(53, 25, 196, 76);
    context.clip();
    rect(context, '#30394f', 53, 25, 196, 76);
    rect(context, '#455068', 53, 65, 196, 36);
    rect(context, '#273044', 53, 85, 196, 16);
    for (let index = 0; index < 13; index += 1) {
      const x = 48 + index * 18 + ((index * 7) % 11);
      const height = 8 + ((index * 13) % 25);
      rect(context, index % 3 === 0 ? '#292b40' : '#34384b', x, 85 - height, 13, height + 18);
      if (index % 2 === 0) rect(context, '#c19b65', x + 4, 82 - height, 2, 2);
    }
    rect(context, '#7b8798', 53, 94, 196, 2);

    const rainCount = this.reducedMotion ? 9 : 30;
    for (let index = 0; index < rainCount; index += 1) {
      const baseX = 54 + ((index * 47) % 194);
      const speed = 8 + (index % 5) * 3;
      const y = 20 + ((index * 29 + time * speed) % 89);
      rect(context, index % 4 ? '#71839a' : '#a3b0be', baseX, y, 1, index % 3 === 0 ? 5 : 3);
    }
    context.restore();

    rect(context, '#ad765b', 48, 20, 206, 5);
    rect(context, '#6e4541', 48, 101, 206, 7);
    rect(context, '#d29a69', 46, 106, 210, 4);
    for (const x of [112, 180]) {
      rect(context, COLORS.ink, x, 22, 5, 82);
      rect(context, '#9e6852', x + 1, 25, 2, 76);
    }
    rect(context, '#c9986b', 52, 26, 2, 68);
    rect(context, '#58627a', 239, 28, 4, 51);
    rect(context, '#75869a', 243, 29, 2, 48);

    for (let index = 0; index < (this.reducedMotion ? 4 : 11); index += 1) {
      const x = 57 + ((index * 31) % 185);
      const y = 31 + ((index * 17) % 58);
      rect(context, '#a9b2bb', x, y, 1, 2 + (index % 3));
      rect(context, '#53677e', x, y + 3 + (index % 3), 1, 1);
    }
  }

  private drawDoor(time: number): void {
    const context = this.context;
    rect(context, COLORS.ink, 4, 37, 41, 153);
    rect(context, '#704b46', 8, 42, 33, 144);
    rect(context, '#31384d', 12, 48, 25, 76);
    rect(context, '#465269', 14, 50, 21, 72);
    rect(context, '#2b3145', 14, 97, 21, 25);
    rect(context, '#a46b50', 11, 128, 27, 4);
    rect(context, '#8c5a49', 11, 135, 27, 47);
    rect(context, COLORS.cream, 33, 139, 3, 3);
    rect(context, '#d8b16f', 17, 65, 15, 12);
    rect(context, '#5d3c3c', 19, 67, 11, 8);
    rect(context, '#e6cb91', 20, 68, 9, 1);
    rect(context, '#e6cb91', 22, 71, 5, 1);

    if (!this.active) return;
    for (let index = 0; index < (this.reducedMotion ? 2 : 6); index += 1) {
      const y = 48 + ((index * 23 + time * (10 + index)) % 74);
      rect(context, '#8594a6', 15 + ((index * 7) % 19), y, 1, 4);
    }
  }

  private drawArchitecture(): void {
    const context = this.context;
    rect(context, COLORS.ink, 0, 8, WORLD_WIDTH, 7);
    for (let x = 0; x < WORLD_WIDTH; x += 48) rect(context, x % 96 === 0 ? '#392931' : '#473039', x, 8, 45, 4);

    for (const x of [78, 150, 224, 302, 354]) {
      rect(context, '#38282e', x, 0, 3, 18);
      rect(context, '#e4ac63', x - 5, 17, 13, 3);
      rect(context, COLORS.glow, x - 7, 20, 17, 4);
      rect(context, '#c77b4d', x - 5, 24, 13, 2);
    }

    rect(context, COLORS.ink, 268, 21, 101, 62);
    rect(context, '#3d3034', 273, 26, 91, 52);
    rect(context, '#d8b377', 280, 32, 28, 2);
    rect(context, '#c88a63', 281, 39, 71, 2);
    rect(context, '#d8b377', 281, 47, 54, 2);
    rect(context, '#c88a63', 281, 55, 64, 2);
    rect(context, '#d8b377', 281, 63, 37, 2);
    rect(context, '#a56a55', 344, 31, 11, 10);

    rect(context, '#50353c', 257, 89, 6, 43);
    rect(context, '#b77a55', 255, 88, 10, 3);
    rect(context, '#5c765f', 259, 81, 3, 8);
    rect(context, '#77906c', 254, 82, 4, 5);
    rect(context, '#6b855f', 263, 79, 4, 8);
  }

  private drawFurnitureBack(): void {
    const context = this.context;
    rect(context, '#3a282f', 60, 139, 105, 5);
    rect(context, '#8d5845', 62, 136, 101, 5);
    for (const x of [68, 153]) rect(context, '#50353a', x, 140, 4, 30);

    for (const x of [105, 179]) {
      rect(context, '#37272e', x - 17, 170, 35, 5);
      rect(context, COLORS.woodLight, x - 15, 167, 31, 4);
      rect(context, '#51343a', x - 2, 171, 4, 33);
      rect(context, '#3b2930', x - 12, 202, 24, 3);
    }

    for (const x of [78, 130, 158, 207]) {
      rect(context, '#54363b', x, 177, 4, 25);
      rect(context, '#74483f', x - 3, 174, 10, 5);
    }
  }

  private drawFurnitureFront(): void {
    const context = this.context;
    for (const x of [105, 179]) {
      rect(context, '#33242b', x - 16, 172, 33, 3);
      rect(context, '#a66b4b', x - 14, 169, 29, 3);
    }
    rect(context, '#33242a', 55, 204, 176, 4);
  }

  private drawCounter(time: number): void {
    const context = this.context;
    rect(context, COLORS.ink, 279, 119, 101, 9);
    rect(context, '#d3965f', 277, 116, 105, 7);
    rect(context, COLORS.counter, 283, 124, 97, 83);
    rect(context, '#7f4e43', 288, 131, 87, 72);
    for (let x = 291; x < 375; x += 14) rect(context, '#9b5c48', x, 133, 2, 68);
    rect(context, '#4b3036', 279, 204, 105, 7);

    rect(context, '#332c34', 323, 81, 38, 34);
    rect(context, '#747079', 326, 84, 32, 28);
    rect(context, '#302b32', 330, 88, 24, 11);
    rect(context, '#d7a55f', 333, 91, 4, 3);
    rect(context, '#8f3739', 344, 91, 3, 3);
    rect(context, '#28242a', 331, 103, 5, 10);
    rect(context, '#28242a', 348, 103, 5, 10);
    rect(context, '#c9b6a0', 335, 110, 14, 5);
    rect(context, '#eee2c9', 337, 108, 10, 3);

    for (const x of [291, 306, 367]) {
      rect(context, '#efe0bd', x, 110, 8, 6);
      rect(context, '#b87755', x + 7, 112, 3, 3);
      rect(context, '#8d604e', x, 116, 9, 2);
    }

    const steamCount = this.reducedMotion ? 2 : 5;
    for (let index = 0; index < steamCount; index += 1) {
      const rise = (time * (4 + index * 0.25) + index * 4) % 18;
      rect(context, index % 2 ? '#d7c6ad' : '#ead8b8', 340 + (index % 3) * 2, 107 - rise, 1, 3);
    }

    rect(context, '#5f403f', 284, 94, 28, 20);
    rect(context, '#c89561', 287, 97, 22, 14);
    rect(context, '#6d423e', 289, 99, 18, 10);
    rect(context, '#f0cf8b', 291, 101, 14, 2);
    rect(context, '#d6a76c', 294, 105, 8, 1);
  }

  private drawGuest(guest: Guest, time: number): void {
    const context = this.context;
    const x = Math.round(guest.position.x);
    const seated = guest.state === 'activity';
    const bob = this.reducedMotion ? 0 : guest.state.includes('walking') || guest.state === 'entering' || guest.state === 'exiting'
      ? Math.round(Math.sin(guest.animation))
      : 0;
    const footY = Math.round(guest.position.y) + bob;
    const bodyTop = footY - (seated ? 14 : 20);
    const facing = guest.facing;

    rect(context, '#2d2229', x - 6, footY + 1, 13, 3);
    if (!seated) {
      const stride = this.reducedMotion ? 0 : Math.round(Math.sin(guest.animation)) * 2;
      rect(context, '#30262e', x - 4 + stride, footY - 5, 3, 7);
      rect(context, '#30262e', x + 2 - stride, footY - 5, 3, 7);
    }
    rect(context, COLORS.ink, x - 6, bodyTop - 1, 12, seated ? 12 : 16);
    rect(context, guest.palette.coat, x - 5, bodyTop, 10, seated ? 11 : 15);
    rect(context, guest.palette.accent, x + (facing > 0 ? 3 : -5), bodyTop + 5, 2, 7);
    rect(context, COLORS.ink, x - 5, bodyTop - 9, 10, 9);
    rect(context, guest.palette.skin, x - 4, bodyTop - 8, 8, 7);
    rect(context, guest.palette.hair, x - 5, bodyTop - 9, 10, 4);
    rect(context, guest.palette.hair, x - (facing > 0 ? 5 : 4), bodyTop - 6, facing > 0 ? 3 : 2, 5);
    rect(context, '#2a2129', x + facing * 3, bodyTop - 5, 1, 1);

    if (guest.state === 'ordering') {
      rect(context, '#f0dfba', x + 7, bodyTop - 3, 5, 7);
      rect(context, '#a85e45', x + 8, bodyTop - 1, 3, 1);
    }
    if (guest.state === 'waiting') {
      rect(context, '#ede0c7', x + facing * 6 - 2, bodyTop + 5, 5, 4);
      rect(context, '#8d5947', x + facing * 6 - 1, bodyTop + 5, 3, 1);
    }
    if (!seated) return;

    switch (guest.activity) {
      case 'reading':
        polygon(context, '#d7b779', [[x - 8, bodyTop + 5], [x, bodyTop + 7], [x + 8, bodyTop + 5], [x + 7, bodyTop + 11], [x, bodyTop + 10], [x - 7, bodyTop + 11]]);
        rect(context, '#875244', x, bodyTop + 7, 1, 4);
        break;
      case 'typing':
        rect(context, '#302b35', x - 7, bodyTop + 2, 13, 8);
        rect(context, '#71818a', x - 5, bodyTop + 3, 9, 5);
        rect(context, '#b4a883', x - 8, bodyTop + 10, 17, 2);
        break;
      case 'talking': {
        const pulse = this.reducedMotion ? 0 : Math.round(Math.sin(time * 2 + x));
        rect(context, '#f2dfb4', x + facing * 7, bodyTop - 13 + pulse, 7, 5);
        rect(context, '#b47756', x + facing * 7 + 2, bodyTop - 11 + pulse, 1, 1);
        rect(context, '#f2dfb4', x + facing * 7 + (facing > 0 ? 0 : 5), bodyTop - 8 + pulse, 2, 2);
        break;
      }
      case 'drinking': {
        const lift = this.reducedMotion ? 0 : Math.sin(guest.animation * 0.4) > 0.45 ? -3 : 0;
        rect(context, '#f1dfbd', x + facing * 6 - 2, bodyTop + 5 + lift, 6, 5);
        rect(context, '#9b634b', x + facing * 6 - 1, bodyTop + 5 + lift, 4, 1);
        break;
      }
    }
  }

  private drawBarista(barista: Barista): void {
    const context = this.context;
    const x = Math.round(barista.position.x);
    const y = Math.round(barista.position.y);
    const bob = this.reducedMotion ? 0 : Math.round(Math.sin(barista.animation) * 0.5);
    rect(context, '#2c2228', x - 6, y - 23 + bob, 12, 11);
    rect(context, '#4f746d', x - 5, y - 22 + bob, 10, 10);
    rect(context, '#d9c4a4', x - 4, y - 15 + bob, 8, 5);
    rect(context, '#c88f68', x - 4, y - 30 + bob, 8, 7);
    rect(context, '#30252a', x - 5, y - 31 + bob, 10, 4);
    rect(context, '#30252a', x - 5, y - 28 + bob, 3, 5);
    rect(context, '#2b2228', x + barista.facing * 3, y - 27 + bob, 1, 1);
    rect(context, '#efc776', x - 3, y - 13 + bob, 6, 2);
    if (barista.task === 'wiping') rect(context, '#6c9b91', x + barista.facing * 7, y - 8 + bob, 7, 3);
    if (barista.task === 'serving') {
      rect(context, '#f0dfbd', x - 9, y - 12 + bob, 6, 5);
      rect(context, '#9b6049', x - 8, y - 12 + bob, 4, 1);
    }
  }

  private drawForeground(time: number): void {
    const context = this.context;
    rect(context, '#38282f', 0, 211, WORLD_WIDTH, 5);
    for (let index = 0; index < 12; index += 1) {
      const x = 10 + index * 34;
      rect(context, index % 2 ? '#6c4644' : '#795047', x, 207, 15, 1);
      rect(context, '#4e363b', x + 3, 209, 8, 1);
    }

    if (!this.active) return;
    const motes = this.reducedMotion ? 3 : 10;
    for (let index = 0; index < motes; index += 1) {
      const x = 60 + ((index * 41) % 290);
      const y = 38 + ((index * 23 + time * (index % 3 + 1)) % 124);
      rect(context, index % 2 ? '#e1b16c' : '#c78c58', x, y, 1, 1);
    }
  }
}
