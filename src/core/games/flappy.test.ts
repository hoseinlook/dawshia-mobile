import { birdYFromElbow, collides, FLAPPY, FlappyGame, pipeAt, pipesPassed, seededRandom, visiblePipes } from './flappy';

describe('flappy course', () => {
  it('is deterministic per seed (same course for both 1v1 players)', () => {
    expect(seededRandom(42, 3)).toBe(seededRandom(42, 3));
    expect(seededRandom(42, 3)).not.toBe(seededRandom(43, 3));
    for (let i = 0; i < 100; i++) {
      const r = seededRandom(7, i);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it('shrinks gaps but never below the minimum', () => {
    expect(pipeAt(1, 0, 0).gapSize).toBeCloseTo(FLAPPY.gapStart);
    expect(pipeAt(1, 1000, 0).gapSize).toBe(FLAPPY.gapMin);
  });

  it('scrolls pipes left and counts the ones passed', () => {
    expect(pipesPassed(0)).toBe(0);
    expect(visiblePipes(1, 0).length).toBeGreaterThan(0);
    // After 60 s the field moved 15 widths: roughly 25 pipes passed.
    const passed = pipesPassed(60_000);
    expect(passed).toBeGreaterThan(20);
    expect(passed).toBeLessThan(30);
    // Monotonic.
    let last = 0;
    for (let t = 0; t < 30_000; t += 250) {
      const p = pipesPassed(t);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
  });

  it('maps push-up height to bird height', () => {
    expect(birdYFromElbow(175)).toBeCloseTo(0.12);
    expect(birdYFromElbow(80)).toBeCloseTo(0.88);
    expect(birdYFromElbow(125)).toBeCloseTo(0.5);
  });
});

describe('FlappyGame', () => {
  /** Flies perfectly through the center of each gap. */
  function perfectBird(seed: number, t: number): number {
    const pipe = visiblePipes(seed, t).find((p) => p.x + FLAPPY.pipeWidth / 2 >= FLAPPY.birdX - FLAPPY.birdRadius);
    return pipe ? pipe.gapCenter : 0.5;
  }

  it('scores pipes while flying through the gaps', () => {
    const game = new FlappyGame(99);
    let state = game.current;
    for (let t = 0; t <= 30_000; t += 33) state = game.step(t, perfectBird(99, t), true);
    expect(state.crashed).toBe(false);
    expect(state.points).toBe(pipesPassed(30_000));
    expect(state.points).toBeGreaterThan(8);
  });

  it('crashes into a pipe when the bird stays at the very top', () => {
    const game = new FlappyGame(99);
    let state = game.current;
    for (let t = 0; t <= 30_000 && !state.crashed; t += 33) state = game.step(t, 0.05, true);
    expect(state).toMatchObject({ crashed: true, reason: 'pipe' });
    expect(collides(99, 0, 0.5)).toBe(false); // nothing to hit at the start
  });

  it('ends the game when the athlete leaves the plank', () => {
    const game = new FlappyGame(1);
    game.step(1000, 0.5, true);
    expect(game.step(1100, 0.5, false)).toMatchObject({ crashed: true, reason: 'plank' });
    // Stays crashed.
    expect(game.step(5000, 0.5, true).crashed).toBe(true);
  });
});
