import { intenseFromMs, musicStage } from './matchSounds';

jest.mock('../../../assets/sounds/match/countdown.wav', () => 1, { virtual: true });

describe('match music stages', () => {
  it('raises the stakes near the end', () => {
    expect(intenseFromMs(60_000)).toBe(15_000);
    expect(intenseFromMs(180_000)).toBe(30_000);
    expect(musicStage('countdown', 60_000, 60_000)).toBe('off');
    expect(musicStage('live', 40_000, 60_000)).toBe('normal');
    expect(musicStage('live', 15_000, 60_000)).toBe('intense');
    expect(musicStage('live', 31_000, 180_000)).toBe('normal');
    expect(musicStage('live', 29_000, 180_000)).toBe('intense');
    expect(musicStage('finished', 0, 60_000)).toBe('off');
  });
});
