import {
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
  type ColorRepresentation,
} from 'three';

// Kleine Pixelspiele auf den Bildschirmen der Arcade-Automaten. Jeder Automat zeigt sein eigenes Spiel,
// das sich ein paarmal pro Sekunde weiterzeichnet; ohne Browser (Tests) bleibt der Bildschirm einfarbig.

export type ArcadeGame = 'invaders' | 'pong' | 'racer' | 'blocks' | 'maze' | 'stars';

export const ARCADE_GAMES: readonly ArcadeGame[] = ['invaders', 'racer', 'blocks', 'pong', 'stars', 'maze'];

const WIDTH = 40;
const HEIGHT = 30;
/** Bilder pro Sekunde; wenig genug für alte Automaten, genug, dass sich etwas bewegt. */
const FPS = 10;
const BACKGROUND = '#070b18';

type Draw = (context: CanvasRenderingContext2D, frame: number, accent: string) => void;

function rect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string): void {
  context.fillStyle = color;
  context.fillRect(Math.round(x), Math.round(y), width, height);
}

/** Dreieckswelle zwischen 0 und `span`, für Bälle und Hin-und-her-Bewegungen. */
function bounce(value: number, span: number): number {
  const period = span * 2;
  const position = ((value % period) + period) % period;
  return position < span ? position : period - position;
}

const DRAW: Readonly<Record<ArcadeGame, Draw>> = {
  invaders(context, frame, accent) {
    const march = bounce(Math.floor(frame / 3), 10);
    const descend = Math.floor(frame / 60) % 6;
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const x = 4 + march + column * 6;
        const y = 3 + descend + row * 4;
        const color = row === 0 ? '#ff6fb5' : row === 1 ? accent : '#f6e27a';
        rect(context, x, y, 3, 2, color);
        if (frame % 6 < 3) rect(context, x - 1, y + 1, 1, 1, color);
        else rect(context, x + 3, y + 1, 1, 1, color);
      }
    }
    const ship = 6 + bounce(frame, 26);
    rect(context, ship, 26, 5, 2, '#9cf7ff');
    rect(context, ship + 2, 25, 1, 1, '#9cf7ff');
    const shot = frame % 14;
    if (shot < 10) rect(context, ship + 2, 24 - shot * 2, 1, 2, '#ffffff');
  },
  pong(context, frame, accent) {
    for (let y = 1; y < HEIGHT; y += 4) rect(context, WIDTH / 2, y, 1, 2, '#3a4766');
    const ballX = 3 + bounce(frame * 1.6, WIDTH - 7);
    const ballY = 2 + bounce(frame * 1.1, HEIGHT - 5);
    rect(context, ballX, ballY, 2, 2, '#ffffff');
    const leftPaddle = Math.max(1, Math.min(HEIGHT - 8, ballY - 3 + Math.sin(frame / 7) * 2));
    const rightPaddle = Math.max(1, Math.min(HEIGHT - 8, ballY - 3 - Math.sin(frame / 5) * 2));
    rect(context, 1, leftPaddle, 1, 7, accent);
    rect(context, WIDTH - 2, rightPaddle, 1, 7, '#ff6fb5');
    const score = Math.floor(frame / 50) % 5;
    for (let point = 0; point < score; point += 1) rect(context, 14 - point * 2, 2, 1, 1, accent);
  },
  racer(context, frame, accent) {
    rect(context, 0, 0, WIDTH, 9, '#1b1440');
    rect(context, 0, 8, WIDTH, 1, '#ff6fb5');
    for (let y = 9; y < HEIGHT; y += 1) {
      const depth = (y - 9) / (HEIGHT - 9);
      const half = 3 + depth * 17;
      const center = WIDTH / 2 + Math.sin(frame / 18) * (1 - depth) * 6;
      const stripe = Math.floor(y * (1.2 + depth) + frame * 1.5) % 6 < 3;
      rect(context, 0, y, WIDTH, 1, stripe ? '#0f2a24' : '#12352d');
      rect(context, center - half, y, half * 2, 1, '#2b2f3f');
      rect(context, center - half, y, 1, 1, stripe ? '#ffffff' : '#ff4f6d');
      rect(context, center + half - 1, y, 1, 1, stripe ? '#ffffff' : '#ff4f6d');
      if (stripe && depth > 0.15) rect(context, center, y, 1, 1, '#f6e27a');
    }
    const car = WIDTH / 2 - 3 + Math.sin(frame / 9) * 6;
    rect(context, car, 24, 6, 3, accent);
    rect(context, car + 1, 23, 4, 1, '#ffffff');
    rect(context, car, 27, 1, 1, '#000000');
    rect(context, car + 5, 27, 1, 1, '#000000');
  },
  blocks(context, frame, accent) {
    const colors = ['#ff6fb5', accent, '#f6e27a', '#7dff9a', '#b48cff'];
    const left = 10;
    rect(context, left - 1, 0, 1, HEIGHT, '#3a4766');
    rect(context, left + 20, 0, 1, HEIGHT, '#3a4766');
    const cycle = Math.floor(frame / 120);
    const progress = frame % 120;
    // Der Stapel wächst über einen Durchgang und räumt danach eine Reihe ab.
    for (let column = 0; column < 10; column += 1) {
      const height = Math.min(9, Math.floor(((column * 7 + cycle * 3) % 5) + progress / 30));
      for (let level = 0; level < height; level += 1) {
        const flash = progress > 110 && level === 0;
        rect(context, left + column * 2, HEIGHT - 2 - level * 2, 2, 2, flash ? '#ffffff' : colors[(column + level + cycle) % colors.length]!);
      }
    }
    const falling = Math.floor(progress / 2) % 13;
    const pieceColumn = (cycle * 3 + Math.floor(progress / 26)) % 8;
    for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, 1]]) {
      rect(context, left + (pieceColumn + dx!) * 2, falling * 2 + dy! * 2, 2, 2, colors[(cycle + 2) % colors.length]!);
    }
  },
  maze(context, frame, accent) {
    const track: [number, number][] = [];
    for (let x = 4; x <= 35; x += 1) track.push([x, 5]);
    for (let y = 6; y <= 24; y += 1) track.push([35, y]);
    for (let x = 34; x >= 4; x -= 1) track.push([x, 24]);
    for (let y = 23; y >= 6; y -= 1) track.push([4, y]);
    rect(context, 7, 8, 26, 13, '#16204a');
    rect(context, 9, 10, 22, 9, BACKGROUND);
    const position = frame % track.length;
    for (const [index, [x, y]] of track.entries()) {
      const eaten = index <= position && index > position - 40;
      if (!eaten && index % 3 === 0) rect(context, x, y, 1, 1, '#f6d7a0');
    }
    const [pacX, pacY] = track[position]!;
    rect(context, pacX - 1, pacY - 1, 3, 3, '#ffe14d');
    if (frame % 4 < 2) rect(context, pacX + 1, pacY, 1, 1, BACKGROUND);
    const [ghostX, ghostY] = track[(position - 9 + track.length) % track.length]!;
    rect(context, ghostX - 1, ghostY - 1, 3, 3, accent);
    rect(context, ghostX, ghostY - 1, 1, 1, '#ffffff');
  },
  stars(context, frame, accent) {
    for (let star = 0; star < 18; star += 1) {
      const speed = 1 + (star % 3);
      const x = (WIDTH - ((frame * speed + star * 37) % (WIDTH + 4)));
      const y = (star * 11) % HEIGHT;
      rect(context, x, y, speed === 3 ? 2 : 1, 1, speed === 1 ? '#3a4766' : speed === 2 ? '#8ea2d8' : '#ffffff');
    }
    const shipY = 12 + Math.sin(frame / 8) * 6;
    rect(context, 4, shipY, 5, 2, accent);
    rect(context, 7, shipY - 1, 2, 1, accent);
    rect(context, 2, shipY + (frame % 2), 2, 1, '#ff9a3c');
    const enemyX = WIDTH - ((frame * 2) % (WIDTH + 10));
    rect(context, enemyX, 6 + (frame % 30 < 15 ? 0 : 12), 3, 3, '#ff6fb5');
    if (frame % 10 < 5) rect(context, 10 + (frame % 10) * 4, shipY, 3, 1, '#ffffff');
  },
};

export class ArcadeScreen {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly context?: CanvasRenderingContext2D;
  private readonly texture?: CanvasTexture;
  private readonly accent: string;
  /** Dunkle Fassung der Automatenfarbe als Hintergrund, damit der Bildschirm auch bei ruhigen Szenen leuchtet. */
  private readonly background: string;
  private lastFrame = -1;

  constructor(readonly game: ArcadeGame, accent: ColorRepresentation, width: number, height: number) {
    this.accent = `#${new Color(accent).getHexString()}`;
    this.background = `#${new Color(accent).lerp(new Color(BACKGROUND), 0.72).getHexString()}`;
    const material = new MeshBasicMaterial({ color: new Color(accent) });
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      const context = canvas.getContext('2d') ?? undefined;
      if (context) {
        this.context = context;
        this.texture = new CanvasTexture(canvas);
        this.texture.colorSpace = SRGBColorSpace;
        this.texture.magFilter = NearestFilter;
        this.texture.minFilter = NearestFilter;
        this.texture.generateMipmaps = false;
        material.map = this.texture;
        // Etwas heller als Weiß, damit der Bildschirm im Dunkeln leuchtet und die Bloom-Stufe ihn erfasst.
        material.color.setScalar(1.7);
      }
    }
    this.mesh = new Mesh(new PlaneGeometry(width, height), material);
    this.mesh.name = `arcade-screen:${game}`;
    this.update(0);
  }

  /** Zeichnet das Spiel weiter, wenn ein neues Bild fällig ist. */
  update(time: number): void {
    if (!this.context || !this.texture) return;
    const frame = Math.max(0, Math.floor(time * FPS));
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    this.context.fillStyle = this.background;
    this.context.fillRect(0, 0, WIDTH, HEIGHT);
    DRAW[this.game](this.context, frame, this.accent);
    // Leichte Bildzeilen wie auf einem Röhrenmonitor.
    this.context.fillStyle = 'rgba(0, 0, 0, 0.14)';
    for (let y = 1; y < HEIGHT; y += 2) this.context.fillRect(0, y, WIDTH, 1);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.texture?.dispose();
  }
}
