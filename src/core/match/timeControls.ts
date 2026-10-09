/**
 * Chess-style time controls. A match lasts `durationSec`; most valid reps wins.
 * Display names live in src/i18n/messages (`timeControls.<id>`).
 */
export type TimeControlId = 'bullet' | 'blitz' | 'rapid' | 'endurance';

export interface TimeControl {
  id: TimeControlId;
  durationSec: number;
}

export const TIME_CONTROLS: readonly TimeControl[] = [
  { id: 'bullet', durationSec: 60 },
  { id: 'blitz', durationSec: 180 },
  { id: 'rapid', durationSec: 300 },
  { id: 'endurance', durationSec: 600 },
];

export const DEFAULT_TIME_CONTROL: TimeControlId = 'bullet';

export function getTimeControl(id: string | undefined): TimeControl {
  return TIME_CONTROLS.find((t) => t.id === id) ?? TIME_CONTROLS[0];
}
