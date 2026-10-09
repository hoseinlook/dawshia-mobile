import type { Messages } from './messages/fa';

type ExerciseText = Messages['exercises']['pushup'];

/** Texts for an exercise id; falls back to the id if a translation is missing. */
export function exerciseText(m: Messages, id: string): ExerciseText {
  const texts = m.exercises as Record<string, ExerciseText | undefined>;
  return texts[id] ?? { name: id, description: '', instructions: [] };
}

/** Message for a form cue code; falls back to the code itself. */
export function cueText(m: Messages, code: string): string {
  return (m.cues as Record<string, string | undefined>)[code] ?? code;
}

export function timeControlText(m: Messages, id: string): { label: string; description: string } {
  const texts = m.timeControls as Record<string, { label: string; description: string } | undefined>;
  return texts[id] ?? { label: id, description: '' };
}
