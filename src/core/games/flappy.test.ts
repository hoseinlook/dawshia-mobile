import { collides, FLAPPY, FlappyGame, pipeAt, pipesPassed, seededRandom, visiblePipes } from './flappy';

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

  it('keeps each gap within reach of the previous one', () => {
    for (const seed of [1, 7, 99, 12345]) {
      for (let i = 1; i < 200; i++) {
        const prev = pipeAt(seed, i - 1, 0).gapCenter;
        const cur = pipeAt(seed, i, 0).gapCenter;
        expect(Math.abs(cur - prev)).toBeLessThanOrEqual(FLAPPY.gapCenterStep + 1e-9);
        expect(cur).toBeGreaterThanOrEqual(FLAPPY.gapCenterMin);
        expect(cur).toBeLessThanOrEqual(FLAPPY.gapCenterMax);
      }
    }
  });

  it('scrolls pipes left and counts the ones passed', () => {
    expect(pipesPassed(0)).toBe(0);
    expect(visiblePipes(1, 0).length).toBeGreaterThan(0);
    // After 60 s the field moved 12.6 widths: roughly 21 pipes passed.
    const passed = pipesPassed(60_000);
    expect(passed).toBeGreaterThan(17);
    expect(passed).toBeLessThan(25);
    // Monotonic.
    let last = 0;
    for (let t = 0; t < 30_000; t += 250) {
      const p = pipesPassed(t);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
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

  it('forgives a short touch of a pipe (a detection glitch) but not a longer one', () => {
    const seed = 99;
    // When the first pipe reaches the bird.
    let t = 0;
    while (!collides(seed, t, 0.01)) t += 10;
    const center = pipeAt(seed, 0, t).gapCenter;
    const game = new FlappyGame(seed);
    game.step(t - 100, center, true);
    expect(game.step(t, 0.01, true).crashed).toBe(false);
    expect(game.step(t + 100, 0.01, true).crashed).toBe(false);
    expect(game.step(t + 133, center, true).crashed).toBe(false); // back in the gap: forgiven
    game.step(t + 166, 0.01, true);
    expect(game.step(t + 166 + FLAPPY.crashAfterMs, 0.01, true)).toMatchObject({ crashed: true, reason: 'pipe' });
  });

  it('ends the game when the athlete leaves the plank', () => {
    const game = new FlappyGame(1);
    game.step(1000, 0.5, true);
    expect(game.step(1100, 0.5, false)).toMatchObject({ crashed: true, reason: 'plank' });
    // Stays crashed.
    expect(game.step(5000, 0.5, true).crashed).toBe(true);
  });
});
