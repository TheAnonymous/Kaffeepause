/**
 * Wo eine Gast-Figur gezeichnet wird und wohin sie sich dreht, wenn sie sich hinsetzt oder aufsteht.
 * Darstellung und Prüfungen nutzen dieselbe Logik, damit Tests wirklich sehen, was man sieht.
 */

/** Wie schnell der Versatz beim Hinsetzen oder Aufstehen ausklingt (pro Sekunde). */
const SETTLE_RATE = 7;

/** So weit entfernt vom Sitz bleibt ein Aufgestandener noch zum Sitz gedreht, damit er sich nicht in der Lehne dreht. */
export const LEAVE_HOLD_DISTANCE = 0.55;

export interface MotionState {
  seated?: boolean;
  /** Gezeichnete Lage in Diorama-Einheiten. */
  x: number;
  z: number;
  /** Rest-Versatz nach dem Hinsetzen oder Aufstehen, der weich abklingt. */
  settleX: number;
  settleZ: number;
  /** Sitzplatz, den der Gast zuletzt belegt hat, solange er noch daneben steht. */
  seat?: { readonly x: number; readonly z: number; readonly yaw: number };
  /** Ob `followPoint` schon einmal gesetzt wurde (das erste Mal springt die Figur an ihren Platz). */
  followed?: boolean;
}

export function newMotionState(): MotionState {
  return { x: 0, z: 0, settleX: 0, settleZ: 0 };
}

export interface MotionInput {
  readonly seated: boolean;
  /** Bezugspunkt: Sitzmitte, wenn er sitzt, sonst seine Position im Raum. */
  readonly point: { readonly x: number; readonly z: number };
  readonly offsetX: number;
  /** Sitzmitte und Blickrichtung des belegten Platzes; nur für sitzende Gäste. */
  readonly seat?: { readonly x: number; readonly z: number; readonly yaw: number };
  readonly deltaSeconds: number;
}

/** Setzt die gezeichnete Lage und gibt zurück, in welche Richtung die Figur noch bleiben soll. */
export function advanceMotion(state: MotionState, input: MotionInput): { holdYaw?: number } {
  // Beim Hinsetzen oder Aufstehen springt der Bezugspunkt; der Versatz klingt weich ab.
  if (state.seated !== undefined && state.seated !== input.seated) {
    state.settleX = state.x - input.point.x - input.offsetX;
    state.settleZ = state.z - input.point.z;
  }
  state.seated = input.seated;
  const decay = Math.exp(-SETTLE_RATE * input.deltaSeconds);
  state.settleX = Math.abs(state.settleX * decay) < 0.002 ? 0 : state.settleX * decay;
  state.settleZ = Math.abs(state.settleZ * decay) < 0.002 ? 0 : state.settleZ * decay;
  state.x = input.point.x + input.offsetX + state.settleX;
  state.z = input.point.z + state.settleZ;

  if (input.seated) {
    state.seat = input.seat;
    return {};
  }
  if (!state.seat) return {};
  if (Math.hypot(state.x - state.seat.x, state.z - state.seat.z) > LEAVE_HOLD_DISTANCE) {
    state.seat = undefined;
    return {};
  }
  return { holdYaw: state.seat.yaw };
}

/** Höchstgeschwindigkeit, mit der eine Figur einem Sprung ihrer Position nachläuft (Diorama-Einheiten pro Sekunde). */
const FOLLOW_SPEED = 3.2;

/**
 * Lässt eine Figur zu ihrem Ziel laufen, statt dort zu erscheinen. Die Simulation setzt die Bedienung bei
 * manchen Szenen sofort an einen anderen Platz; so sieht man sie stattdessen hinübergehen.
 * Gibt zurück, wie weit sie noch vom Ziel entfernt ist und in welche Richtung sie läuft.
 */
export function followPoint(
  state: MotionState,
  target: { readonly x: number; readonly z: number },
  deltaSeconds: number,
): { lag: number; heading: { x: number; z: number } } {
  if (!state.followed || deltaSeconds <= 0 || deltaSeconds > 0.5) {
    state.x = target.x;
    state.z = target.z;
    state.followed = true;
    return { lag: 0, heading: { x: 0, z: 0 } };
  }
  const dx = target.x - state.x;
  const dz = target.z - state.z;
  const lag = Math.hypot(dx, dz);
  if (lag === 0) return { lag, heading: { x: 0, z: 0 } };
  const step = Math.min(lag, FOLLOW_SPEED * deltaSeconds);
  state.x += dx / lag * step;
  state.z += dz / lag * step;
  return { lag: lag - step, heading: { x: dx, z: dz } };
}
