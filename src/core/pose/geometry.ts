import type { BodySide, Keypoint, KeypointName, Pose } from './types';

export const DEFAULT_MIN_SCORE = 0.3;

interface Vec2 {
  x: number;
  y: number;
}

/**
 * Converts a normalized keypoint to pixel space so angles are not distorted
 * by the frame's aspect ratio.
 */
function toPixels(k: Keypoint, pose: Pose): Vec2 {
  return { x: k.x * pose.frameWidth, y: k.y * pose.frameHeight };
}

/** Angle ABC in degrees (vertex at B), 0..180. */
export function angleAt(a: Vec2, b: Vec2, c: Vec2): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const magAB = Math.hypot(abx, aby);
  const magCB = Math.hypot(cbx, cby);
  if (magAB === 0 || magCB === 0) return 0;
  const cos = (abx * cbx + aby * cby) / (magAB * magCB);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/**
 * Joint angle between three named keypoints, or `null` if any of them is
 * below the confidence threshold.
 */
export function jointAngle(
  pose: Pose,
  a: KeypointName,
  vertex: KeypointName,
  c: KeypointName,
  minScore = DEFAULT_MIN_SCORE,
): number | null {
  const ka = pose.keypoints[a];
  const kb = pose.keypoints[vertex];
  const kc = pose.keypoints[c];
  if (ka.score < minScore || kb.score < minScore || kc.score < minScore) return null;
  return angleAt(toPixels(ka, pose), toPixels(kb, pose), toPixels(kc, pose));
}

/**
 * Angle of the segment from `a` to `b` relative to the horizontal axis,
 * in degrees, 0..90 (direction-independent). `null` if not visible.
 */
export function inclinationFromHorizontal(
  pose: Pose,
  a: KeypointName,
  b: KeypointName,
  minScore = DEFAULT_MIN_SCORE,
): number | null {
  const ka = pose.keypoints[a];
  const kb = pose.keypoints[b];
  if (ka.score < minScore || kb.score < minScore) return null;
  const pa = toPixels(ka, pose);
  const pb = toPixels(kb, pose);
  const deg = (Math.atan2(Math.abs(pb.y - pa.y), Math.abs(pb.x - pa.x)) * 180) / Math.PI;
  return deg;
}

export function sideKeypoint(side: BodySide, joint: string): KeypointName {
  return `${side}${joint.charAt(0).toUpperCase()}${joint.slice(1)}` as KeypointName;
}

/**
 * Picks the body side facing the camera, i.e. the one whose given joints have
 * the highest summed confidence. Used for side-view exercises.
 */
export function mostVisibleSide(pose: Pose, joints: readonly string[]): BodySide {
  let left = 0;
  let right = 0;
  for (const joint of joints) {
    left += pose.keypoints[sideKeypoint('left', joint)].score;
    right += pose.keypoints[sideKeypoint('right', joint)].score;
  }
  return left >= right ? 'left' : 'right';
}

export function averageScore(pose: Pose, names: readonly KeypointName[]): number {
  if (names.length === 0) return 0;
  let sum = 0;
  for (const n of names) sum += pose.keypoints[n].score;
  return sum / names.length;
}
