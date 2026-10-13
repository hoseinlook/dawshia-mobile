import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

import { MIN_HOLD_ATTEMPT_MS } from '../../src/core/exercises/holdAnalyzer';
import { getExercise } from '../../src/core/exercises/registry';
import { KEYPOINT_NAMES, type Keypoints, type Pose } from '../../src/core/pose/types';
import { isPoseVisible } from '../../src/core/pose/visibility';

/** Keypoints extracted from a video by extract_poses.py. */
export interface PoseTrack {
  video: string;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  /** [timestampMs, [x, y, score] × 17 in KEYPOINT_NAMES order] */
  frames: [number, number[]][];
}

export function loadTrack(path: string): PoseTrack {
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as PoseTrack;
}

/** Same time the app's setup screen waits in the start position before the countdown. */
const READY_HOLD_MS = 1500;

export interface VideoRun {
  frames: number;
  /** Share of frames where a person was detected (the app's visibility rule). */
  visibleRatio: number;
  /** Share of frames the analyzer reported `inPosition`. */
  inPositionRatio: number;
  /** When the setup check (start position for 1.5 s; holds: just visible) would pass, seconds. */
  readyAtS: number | null;
  reps: number;
  repTimesS: number[];
  rejected: Record<string, number>;
  cues: Record<string, number>;
  /** Holds: the app's score — the first hold of at least MIN_HOLD_ATTEMPT_MS, until it breaks. */
  holdS: number | null;
  /** Holds: the longest hold anywhere in the clip. */
  longestHoldS: number | null;
  /** Flappy: range of the bird height (0 = top, 1 = bottom). */
  birdRange: [number, number] | null;
  /** Flappy: full down-and-up bird cycles (one per push-up). */
  birdFlaps: number;
  /** Per-frame analyzer output, for debug_sheet.py. */
  trace: TraceFrame[];
}

export interface TraceFrame {
  ms: number;
  visible: boolean;
  inPosition: boolean;
  phase: string;
  metrics: Record<string, number>;
  events: string[];
  cues: string[];
}

/**
 * Plays a pose track through an exercise analyzer the way a session does
 * (useMatchSession): every frame, null when nobody is visible.
 */
export function runVideo(exerciseId: string, track: PoseTrack): VideoRun {
  const exercise = getExercise(exerciseId);
  if (!exercise) throw new Error(`unknown exercise ${exerciseId}`);
  const analyzer = exercise.createAnalyzer();
  const hold = exercise.competitions.includes('resistance');
  const t0 = 1_000_000;

  let visible = 0;
  let inPosition = 0;
  let readySince: number | null = null;
  let readyAtS: number | null = null;
  const repTimesS: number[] = [];
  const rejected: Record<string, number> = {};
  const cues: Record<string, number> = {};
  let firstHoldMs = 0;
  let firstHoldDone = false;
  let currentHoldMs = 0;
  let longestHoldMs = 0;
  let birdMin = Infinity;
  let birdMax = -Infinity;
  let birdFlaps = 0;
  let birdLow = false;
  const trace: TraceFrame[] = [];

  for (const [ms, flat] of track.frames) {
    const now = t0 + ms;
    const keypoints = {} as Keypoints;
    KEYPOINT_NAMES.forEach((name, i) => {
      keypoints[name] = { x: flat[i * 3], y: flat[i * 3 + 1], score: flat[i * 3 + 2] };
    });
    const pose: Pose | null = isPoseVisible(keypoints)
      ? { keypoints, frameWidth: track.frameWidth, frameHeight: track.frameHeight, timestampMs: now }
      : null;
    if (pose) visible++;

    const update = analyzer.update(pose, now);
    if (update.inPosition) inPosition++;

    if (readyAtS === null) {
      if (hold ? pose !== null : update.inPosition) {
        readySince ??= now;
        if (now - readySince >= READY_HOLD_MS) readyAtS = ms / 1000;
      } else readySince = null;
    }

    for (const e of update.events) {
      if (e.type === 'rep') repTimesS.push(Math.round(ms / 100) / 10);
      else rejected[e.reason.code] = (rejected[e.reason.code] ?? 0) + 1;
    }
    for (const c of update.cues) cues[c.code] = (cues[c.code] ?? 0) + 1;

    trace.push({
      ms,
      visible: pose !== null,
      inPosition: update.inPosition,
      phase: update.phase,
      metrics: update.metrics,
      events: update.events.map((e) => (e.type === 'rep' ? `rep ${e.repNumber}` : `no: ${e.reason.code}`)),
      cues: update.cues.map((c) => c.code),
    });

    const holdMs = update.metrics.holdMs;
    if (hold) {
      // Same rule as useMatchSession: holds under MIN_HOLD_ATTEMPT_MS are retries, not the attempt.
      if (update.inPosition && holdMs !== undefined) {
        longestHoldMs = Math.max(longestHoldMs, holdMs);
        currentHoldMs = holdMs;
        if (!firstHoldDone) firstHoldMs = Math.max(firstHoldMs, holdMs);
      } else {
        if (currentHoldMs >= MIN_HOLD_ATTEMPT_MS) firstHoldDone = true;
        currentHoldMs = 0;
      }
    }
    const bird = update.metrics.birdY;
    if (bird !== undefined && update.inPosition) {
      birdMin = Math.min(birdMin, bird);
      birdMax = Math.max(birdMax, bird);
      // Hysteresis: down past 0.65, then back up past 0.35 = one flap.
      if (bird > 0.65) birdLow = true;
      else if (bird < 0.35 && birdLow) {
        birdLow = false;
        birdFlaps++;
      }
    }
  }

  const n = track.frames.length || 1;
  return {
    frames: track.frames.length,
    visibleRatio: visible / n,
    inPositionRatio: inPosition / n,
    readyAtS,
    reps: repTimesS.length,
    repTimesS,
    rejected,
    cues,
    holdS: hold ? firstHoldMs / 1000 : null,
    longestHoldS: hold ? longestHoldMs / 1000 : null,
    birdRange: birdMin <= birdMax ? [birdMin, birdMax] : null,
    birdFlaps,
    trace,
  };
}

/** One clip in videos.json and what a session should score on it. */
export interface VideoEntry {
  file: string;
  movement: string;
  expectedReps: number | null;
  expectedHoldS: number | null;
  /** Holds: allowed difference in seconds (default 1.5). Reps / flaps: allowed difference (default 0). */
  tolerance?: number;
  skip?: string;
  /** The clip doesn't match the app's camera setup: shown, but not a failure. */
  offSetup?: string;
}

/** Whether a run matches the clip's expected score, and a one-line summary. */
export function judge(v: VideoEntry, r: VideoRun): { ok: boolean; result: string } {
  if (v.movement === 'flappy' && v.expectedReps !== null) {
    // Flappy has no reps: each push-up should fly the bird down and back up.
    const range = r.birdRange?.map((b) => b.toFixed(2)).join('…') ?? 'never';
    return {
      ok: Math.abs(r.birdFlaps - v.expectedReps) <= (v.tolerance ?? 0),
      result: `bird flaps ${r.birdFlaps}/${v.expectedReps} (range ${range})`,
    };
  }
  if (v.expectedReps !== null) {
    return { ok: Math.abs(r.reps - v.expectedReps) <= (v.tolerance ?? 0), result: `reps ${r.reps}/${v.expectedReps}` };
  }
  if (v.expectedHoldS !== null) {
    return {
      ok: Math.abs((r.holdS ?? 0) - v.expectedHoldS) <= (v.tolerance ?? 1.5),
      result: `hold ${r.holdS?.toFixed(1)} s/${v.expectedHoldS} s (longest ${r.longestHoldS?.toFixed(1)} s)`,
    };
  }
  return { ok: r.inPositionRatio > 0.3, result: `in position ${Math.round(r.inPositionRatio * 100)}%` };
}
