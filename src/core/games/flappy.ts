/**
 * "Flappy Push" mini-game: the athlete's push-up height steers a bird through
 * scrolling pipes. Everything is a pure function of (seed, time, bird height),
 * so both players of a 1v1 fly exactly the same course.
 *
 * Coordinates are normalized to the play field: x 0 (left) → 1 (right),
 * y 0 (top) → 1 (bottom).
 */
export const FLAPPY = {
  /** Horizontal bird position. */
  birdX: 0.28,
  birdRadius: 0.035,
  pipeWidth: 0.11,
  /** Distance between pipes. */
  spacing: 0.55,
  /** Field widths per second. */
  speed: 0.25,
  /** First pipe starts off-screen, giving ~3 s to settle into the plank. */
  firstPipeX: 1.1,
  /** Gap height: starts wide, shrinks with every pipe, never below the minimum. */
  gapStart: 0.42,
  gapShrink: 0.008,
  gapMin: 0.26,
  /** Gap centers stay away from the very top/bottom. */
  gapCenterMin: 0.3,
  gapCenterMax: 0.7,
} as const;

/** Deterministic pseudo-random number in [0, 1) for pipe `i` of course `seed` (mulberry32). */
export function seededRandom(seed: number, i: number): number {
  let t = (seed + Math.imul(i + 1, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export interface Pipe {
  index: number;
  /** Center x at the queried time. */
  x: number;
  gapCenter: number;
  gapSize: number;
}

export function pipeAt(seed: number, index: number, elapsedMs: number): Pipe {
  const gapSize = Math.max(FLAPPY.gapMin, FLAPPY.gapStart - index * FLAPPY.gapShrink);
  const span = FLAPPY.gapCenterMax - FLAPPY.gapCenterMin;
  return {
    index,
    x: FLAPPY.firstPipeX + index * FLAPPY.spacing - (FLAPPY.speed * elapsedMs) / 1000,
    gapCenter: FLAPPY.gapCenterMin + seededRandom(seed, index) * span,
    gapSize,
  };
}

/** Pipes currently on (or just entering/leaving) the screen. */
export function visiblePipes(seed: number, elapsedMs: number): Pipe[] {
  const travelled = (FLAPPY.speed * elapsedMs) / 1000;
  const first = Math.max(0, Math.floor((travelled - FLAPPY.firstPipeX - FLAPPY.pipeWidth) / FLAPPY.spacing));
  const pipes: Pipe[] = [];
  for (let i = first; ; i++) {
    const pipe = pipeAt(seed, i, elapsedMs);
    if (pipe.x - FLAPPY.pipeWidth / 2 > 1.05) break;
    if (pipe.x + FLAPPY.pipeWidth / 2 >= -0.05) pipes.push(pipe);
  }
  return pipes;
}

/** Pipes fully behind the bird = points. */
export function pipesPassed(elapsedMs: number): number {
  const travelled = (FLAPPY.speed * elapsedMs) / 1000;
  const passedX = FLAPPY.birdX - FLAPPY.birdRadius - FLAPPY.pipeWidth / 2; // pipe center must be left of this
  // Pipe i is passed when firstPipeX + i·spacing − travelled < passedX.
  const n = Math.floor((travelled + passedX - FLAPPY.firstPipeX) / FLAPPY.spacing) + 1;
  return Math.max(0, n);
}

/** Bird height from the elbow angle: arms locked (top of the push-up) = high, bottom = low. */
export function birdYFromElbow(elbowAngle: number): number {
  const top = 170;
  const bottom = 80;
  const t = (top - elbowAngle) / (top - bottom); // 0 at the top, 1 at the bottom
  return 0.12 + Math.max(0, Math.min(1, t)) * 0.76;
}

/** Whether the bird at height `birdY` hits a pipe at this moment. */
export function collides(seed: number, elapsedMs: number, birdY: number): boolean {
  for (const pipe of visiblePipes(seed, elapsedMs)) {
    const overlapX = Math.abs(pipe.x - FLAPPY.birdX) < FLAPPY.pipeWidth / 2 + FLAPPY.birdRadius;
    if (!overlapX) continue;
    const top = pipe.gapCenter - pipe.gapSize / 2;
    const bottom = pipe.gapCenter + pipe.gapSize / 2;
    if (birdY - FLAPPY.birdRadius < top || birdY + FLAPPY.birdRadius > bottom) return true;
  }
  return false;
}

export interface FlappyState {
  points: number;
  crashed: boolean;
  /** Why the game ended. */
  reason: 'pipe' | 'plank' | null;
}

/**
 * One player's game. Feed it the bird height every frame while the match is
 * live; it reports points and the crash.
 */
export class FlappyGame {
  private state: FlappyState = { points: 0, crashed: false, reason: null };

  constructor(private readonly seed: number) {}

  get current(): FlappyState {
    return this.state;
  }

  step(elapsedMs: number, birdY: number, inPlank: boolean): FlappyState {
    if (this.state.crashed) return this.state;
    if (!inPlank) {
      this.state = { ...this.state, crashed: true, reason: 'plank' };
    } else if (collides(this.seed, elapsedMs, birdY)) {
      this.state = { ...this.state, crashed: true, reason: 'pipe' };
    } else {
      this.state = { ...this.state, points: pipesPassed(elapsedMs) };
    }
    return this.state;
  }
}
