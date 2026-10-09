import { birdYFromElbow } from '../../games/flappy';
import { inclinationFromHorizontal, jointAngle, mostVisibleSide, sideKeypoint } from '../../pose/geometry';
import { SignalSmoother } from '../../pose/smoothing';
import type { Pose } from '../../pose/types';
import type { ExerciseAnalyzer, ExerciseUpdate, FormCue } from '../types';

/** The body must stay within this many degrees of horizontal (a push-up plank). */
export const FLAPPY_MAX_BODY_INCLINE = 40;

const CUES = {
  notVisible: { code: 'notVisible', severity: 'warning' },
  getInPlank: { code: 'getInPlank', severity: 'info' },
} satisfies Record<string, FormCue>;

const JOINTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle'] as const;

/**
 * Flappy Push controller: in a push-up plank, the elbow angle sets the bird
 * height (`metrics.birdY`, 0 = top … 1 = bottom). `inPosition` = in the plank;
 * leaving it ends the game. The game logic itself lives in core/games/flappy.
 */
export class FlappyAnalyzer implements ExerciseAnalyzer {
  private readonly elbowSmoother = new SignalSmoother(0.5);

  update(pose: Pose | null, timestampMs: number): ExerciseUpdate {
    const metrics: Record<string, number> = {};
    if (!pose) return { inPosition: false, phase: 'off', events: [], cues: [CUES.notVisible], metrics };

    const side = mostVisibleSide(pose, JOINTS);
    const k = (joint: string) => sideKeypoint(side, joint);
    const elbow = this.elbowSmoother.update(jointAngle(pose, k('shoulder'), k('elbow'), k('wrist')), timestampMs);
    const lower = pose.keypoints[k('ankle')].score >= pose.keypoints[k('knee')].score ? k('ankle') : k('knee');
    const incline = inclinationFromHorizontal(pose, k('shoulder'), lower);
    if (elbow === null || incline === null) {
      return { inPosition: false, phase: 'off', events: [], cues: [CUES.notVisible], metrics };
    }

    metrics.elbowAngle = Math.round(elbow);
    metrics.birdY = birdYFromElbow(elbow);
    const inPlank = incline <= FLAPPY_MAX_BODY_INCLINE;
    return {
      inPosition: inPlank,
      phase: inPlank ? 'flying' : 'off',
      events: [],
      cues: inPlank ? [] : [CUES.getInPlank],
      metrics,
    };
  }

  reset(): void {
    this.elbowSmoother.reset();
  }
}
