import { listExercises } from '../core/exercises/registry';
import { TIME_CONTROLS } from '../core/match/timeControls';
import { format, localizeDigits } from './format';
import { LOCALES } from './locales';
import { exerciseText } from './lookup';

const CUE_CODES = [
  'notVisible',
  'getInPlank',
  'goLower',
  'tooFast',
  'hipsSag',
  'hipsPike',
  'notVisibleFront',
  'getOnBar',
  'chinOverBar',
  'fullHang',
  'lockOut',
  'kickUp',
  'lockArms',
  'straightBody',
];

describe('format', () => {
  it('fills placeholders and keeps unknown ones', () => {
    expect(format('Set up for {exercise} {x}', { exercise: 'push-ups' })).toBe(
      'Set up for push-ups {x}',
    );
  });
});

describe('localizeDigits', () => {
  it('converts digits to Persian', () => {
    expect(localizeDigits('1:05 · 90%', LOCALES.fa.digits)).toBe('۱:۰۵ · ۹۰%');
  });
});

describe.each(Object.values(LOCALES))('$id messages', ({ messages }) => {
  it('has texts for every registered exercise', () => {
    for (const e of listExercises()) {
      const text = exerciseText(messages, e.id);
      expect(text.name).not.toBe(e.id);
      expect(text.instructions.length).toBeGreaterThan(0);
    }
  });

  it('has a label for every time control', () => {
    for (const t of TIME_CONTROLS) expect(messages.timeControls[t.id].label).toBeTruthy();
  });

  it('has a message for every form cue', () => {
    for (const code of CUE_CODES) {
      expect((messages.cues as Record<string, string>)[code]).toBeTruthy();
    }
  });
});
