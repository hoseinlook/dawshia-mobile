import { jointAngle } from './geometry';
import type { Pose } from './types';

/** Average elbow angle of the visible arms, or null if neither arm is visible. */
export function averageElbowAngle(pose: Pose): number | null {
  const left = jointAngle(pose, 'leftShoulder', 'leftElbow', 'leftWrist');
  const right = jointAngle(pose, 'rightShoulder', 'rightElbow', 'rightWrist');
  const arms = [left, right].filter((a): a is number => a !== null);
  return arms.length ? arms.reduce((a, b) => a + b, 0) / arms.length : null;
}

/**
 * Elbow angle of the more confident arm, accepting weaker detections (minScore 0.2). For holds
 * seen from the side, where the far arm is hidden and an inverted body gets low scores.
 */
export function clearestElbowAngle(pose: Pose, minScore = 0.2): number | null {
  const k = pose.keypoints;
  const armScore = (side: 'left' | 'right') =>
    Math.min(k[`${side}Shoulder`].score, k[`${side}Elbow`].score, k[`${side}Wrist`].score);
  const side = armScore('left') >= armScore('right') ? 'left' : 'right';
  return jointAngle(pose, `${side}Shoulder`, `${side}Elbow`, `${side}Wrist`, minScore);
}

const avg = (a: number, b: number) => (a + b) / 2;

/** Normalized heights (y grows downward) of body landmarks, averaged left/right. */
export function bodyHeights(pose: Pose) {
  const k = pose.keypoints;
  return {
    nose: k.nose.y,
    shoulders: avg(k.leftShoulder.y, k.rightShoulder.y),
    elbows: avg(k.leftElbow.y, k.rightElbow.y),
    wrists: avg(k.leftWrist.y, k.rightWrist.y),
    hips: avg(k.leftHip.y, k.rightHip.y),
    knees: avg(k.leftKnee.y, k.rightKnee.y),
    ankles: avg(k.leftAnkle.y, k.rightAnkle.y),
  };
}

/** Upside down on the hands: feet above the head, hands below the shoulders. */
export function isInverted(pose: Pose): boolean {
  const h = bodyHeights(pose);
  const head = Math.min(h.nose, h.shoulders);
  const feet = Math.min(h.ankles, h.knees);
  return feet < head && h.wrists > h.shoulders;
}
