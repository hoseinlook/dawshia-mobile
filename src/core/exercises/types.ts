import type { TimeControlId } from '../match/timeControls';
import type { Pose } from '../pose/types';

export type ExerciseId = string;

/**
 * Short coaching cue shown while exercising, e.g. `goLower`.
 * The UI translates `code` into a message (see `cues` in src/i18n/messages).
 */
export interface FormCue {
  code: string;
  severity: 'info' | 'warning';
}

export interface RepEvent {
  type: 'rep';
  /** 1-based count of valid reps so far. */
  repNumber: number;
  /** 0..1 — how clean the rep was. Used for tie-breaks and feedback. */
  quality: number;
  durationMs: number;
  timestampMs: number;
}

export interface RepRejectedEvent {
  type: 'repRejected';
  reason: FormCue;
  timestampMs: number;
}

export type ExerciseEvent = RepEvent | RepRejectedEvent;

export interface ExerciseUpdate {
  /** Whether the athlete is visible and in the starting posture. */
  inPosition: boolean;
  /** Current movement phase, exercise-specific (e.g. 'up' | 'down'). */
  phase: string;
  events: ExerciseEvent[];
  cues: FormCue[];
  /** Live numeric metrics for debugging / HUD (e.g. elbowAngle). */
  metrics: Record<string, number>;
}

/**
 * Stateful analyzer for one athlete doing one exercise.
 * Feed it poses in chronological order; it reports reps and form cues.
 */
export interface ExerciseAnalyzer {
  update(pose: Pose | null, timestampMs: number): ExerciseUpdate;
  reset(): void;
}

export interface CameraSetup {
  /** Device orientation required while recording. */
  orientation: 'landscape' | 'portrait';
  /** Which side of the athlete should face the camera. */
  view: 'side' | 'front';
}

/**
 * Everything the app needs to know about an exercise.
 * Adding a new exercise = implement this, register it in `registry.ts`, and
 * add its texts (name, description, setup instructions) under `exercises.<id>`
 * in every file of src/i18n/messages.
 */
export interface ExerciseDefinition {
  id: ExerciseId;
  camera: CameraSetup;
  /**
   * Competition types this exercise offers, in menu order. Today every type is
   * "most valid reps within a time control". Exercises with a different format
   * (e.g. a handstand hold: longest hold wins) will add a new format here.
   */
  competitions: readonly TimeControlId[];
  createAnalyzer(): ExerciseAnalyzer;
}
