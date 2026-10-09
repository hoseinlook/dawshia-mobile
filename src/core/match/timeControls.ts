/**
 * Competition types. Display names live in src/i18n/messages (`timeControls.<id>`).
 *
 * - `timedReps` (chess-style time controls): most valid reps before the clock runs out.
 * - `maxHold` (resistance): hold the position as long as possible; `durationSec` is the cap.
 */
export type TimeControlId = 'bullet' | 'blitz' | 'rapid' | 'endurance' | 'resistance';

export type CompetitionFormat = 'timedReps' | 'maxHold';

export interface TimeControl {
  id: TimeControlId;
  format: CompetitionFormat;
  durationSec: number;
}

export const TIME_CONTROLS: readonly TimeControl[] = [
  { id: 'bullet', format: 'timedReps', durationSec: 60 },
  { id: 'blitz', format: 'timedReps', durationSec: 180 },
  { id: 'rapid', format: 'timedReps', durationSec: 300 },
  { id: 'endurance', format: 'timedReps', durationSec: 600 },
  { id: 'resistance', format: 'maxHold', durationSec: 600 },
];

export const DEFAULT_TIME_CONTROL: TimeControlId = 'bullet';

export function getTimeControl(id: string | undefined): TimeControl {
  return TIME_CONTROLS.find((t) => t.id === id) ?? TIME_CONTROLS[0];
}

export function isHold(id: string | undefined): boolean {
  return getTimeControl(id).format === 'maxHold';
}
