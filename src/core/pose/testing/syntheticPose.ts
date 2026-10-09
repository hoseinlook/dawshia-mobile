import { KEYPOINT_NAMES, type Keypoints, type Pose } from '../types';

/**
 * Builds synthetic side-view poses for unit tests (no camera needed).
 * Left side faces the camera with high confidence; right side is occluded.
 */

const FRAME_W = 1280;
const FRAME_H = 720;
const ARM_SEGMENT = 80;

export interface SideViewOptions {
  /** Shoulder-elbow-wrist angle in degrees. */
  elbowAngle: number;
  /** Vertical hip offset in px from the shoulder-ankle line (+ = sag, - = pike). */
  hipOffset?: number;
  /** Lift the shoulders this many px above the ankles (0 = horizontal plank). */
  shoulderLift?: number;
  timestampMs?: number;
}

export function sideViewPose({
  elbowAngle,
  hipOffset = 0,
  shoulderLift = 0,
  timestampMs = 0,
}: SideViewOptions): Pose {
  const px: Partial<Record<(typeof KEYPOINT_NAMES)[number], [number, number]>> = {};

  const ankle: [number, number] = [1000, 420];
  const shoulder: [number, number] = [500, 420 - shoulderLift];
  const hip: [number, number] = [
    (shoulder[0] + ankle[0]) / 2,
    (shoulder[1] + ankle[1]) / 2 + hipOffset,
  ];
  const knee: [number, number] = [(hip[0] + ankle[0]) / 2, (hip[1] + ankle[1]) / 2];

  // Isosceles arm: wrist straight below the shoulder, elbow bent outward.
  const half = (elbowAngle * Math.PI) / 360;
  const wrist: [number, number] = [shoulder[0], shoulder[1] + 2 * ARM_SEGMENT * Math.sin(half)];
  const elbow: [number, number] = [
    shoulder[0] - ARM_SEGMENT * Math.cos(half),
    (shoulder[1] + wrist[1]) / 2,
  ];

  for (const side of ['left', 'right'] as const) {
    px[`${side}Shoulder`] = shoulder;
    px[`${side}Elbow`] = elbow;
    px[`${side}Wrist`] = wrist;
    px[`${side}Hip`] = hip;
    px[`${side}Knee`] = knee;
    px[`${side}Ankle`] = ankle;
    px[`${side}Eye`] = [shoulder[0] - 60, shoulder[1] - 20];
    px[`${side}Ear`] = [shoulder[0] - 50, shoulder[1] - 20];
  }
  px.nose = [shoulder[0] - 70, shoulder[1] - 15];

  const keypoints = {} as Keypoints;
  for (const name of KEYPOINT_NAMES) {
    const [x, y] = px[name] ?? [0, 0];
    keypoints[name] = {
      x: x / FRAME_W,
      y: y / FRAME_H,
      score: name.startsWith('right') ? 0.1 : 0.9,
    };
  }
  return { keypoints, frameWidth: FRAME_W, frameHeight: FRAME_H, timestampMs };
}

/**
 * Generates a pose stream at ~30 fps that moves the elbow angle through the
 * given waypoints, linearly interpolated over `msPerSegment` each.
 */
export function elbowAngleStream(
  waypoints: number[],
  msPerSegment: number,
  extra: Omit<SideViewOptions, 'elbowAngle' | 'timestampMs'> = {},
  startMs = 0,
): Pose[] {
  const frameMs = 33;
  const poses: Pose[] = [];
  let t = startMs;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const steps = Math.max(1, Math.round(msPerSegment / frameMs));
    for (let s = 0; s < steps; s++) {
      const angle = waypoints[i] + ((waypoints[i + 1] - waypoints[i]) * s) / steps;
      poses.push(sideViewPose({ ...extra, elbowAngle: angle, timestampMs: t }));
      t += frameMs;
    }
  }
  poses.push(sideViewPose({ ...extra, elbowAngle: waypoints[waypoints.length - 1], timestampMs: t }));
  return poses;
}

export interface FrontHangOptions {
  /** Shoulder-elbow-wrist angle in degrees (both arms). */
  elbowAngle: number;
  /** Feet on the floor / standing: hands below the shoulders. */
  standing?: boolean;
  timestampMs?: number;
}

const HANG_FRAME_W = 720;
const HANG_FRAME_H = 1280;
const HANG_ARM = 110;
/** Vertical distance from shoulders up to the nose. */
const HEAD_HEIGHT = 95;
const BAR_Y = 200;

/**
 * Front-view pull-up pose in a portrait frame: hands on a bar at y=200 px,
 * body hanging below. Smaller elbow angles pull the head higher.
 */
export function frontHangPose({ elbowAngle, standing = false, timestampMs = 0 }: FrontHangOptions): Pose {
  const half = (elbowAngle * Math.PI) / 360;
  const drop = 2 * HANG_ARM * Math.sin(half);
  const px: Partial<Record<(typeof KEYPOINT_NAMES)[number], [number, number]>> = {};

  for (const [side, wristX, dir] of [
    ['left', 300, -1],
    ['right', 420, 1],
  ] as const) {
    const wrist: [number, number] = standing ? [wristX, 700] : [wristX, BAR_Y];
    const shoulder: [number, number] = standing ? [wristX, 500] : [wristX, BAR_Y + drop];
    const elbow: [number, number] = standing
      ? [wristX, 600]
      : [wristX + dir * HANG_ARM * Math.cos(half), BAR_Y + drop / 2];
    px[`${side}Wrist`] = wrist;
    px[`${side}Shoulder`] = shoulder;
    px[`${side}Elbow`] = elbow;
    px[`${side}Hip`] = [wristX, shoulder[1] + 250];
    px[`${side}Knee`] = [wristX, shoulder[1] + 400];
    px[`${side}Ankle`] = [wristX, shoulder[1] + 520];
    px[`${side}Eye`] = [wristX + -dir * 30, shoulder[1] - HEAD_HEIGHT - 10];
    px[`${side}Ear`] = [wristX + -dir * 10, shoulder[1] - HEAD_HEIGHT];
  }
  px.nose = [360, (px.leftShoulder![1] + px.rightShoulder![1]) / 2 - HEAD_HEIGHT];

  const keypoints = {} as Keypoints;
  for (const name of KEYPOINT_NAMES) {
    const [x, y] = px[name] ?? [0, 0];
    keypoints[name] = { x: x / HANG_FRAME_W, y: y / HANG_FRAME_H, score: 0.9 };
  }
  return { keypoints, frameWidth: HANG_FRAME_W, frameHeight: HANG_FRAME_H, timestampMs };
}

/** ~30 fps stream through elbow-angle waypoints using any pose builder. */
export function poseStream(
  build: (elbowAngle: number, timestampMs: number) => Pose,
  waypoints: number[],
  msPerSegment: number,
): Pose[] {
  const frameMs = 33;
  const poses: Pose[] = [];
  let t = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const steps = Math.max(1, Math.round(msPerSegment / frameMs));
    for (let s = 0; s < steps; s++) {
      poses.push(build(waypoints[i] + ((waypoints[i + 1] - waypoints[i]) * s) / steps, t));
      t += frameMs;
    }
  }
  poses.push(build(waypoints[waypoints.length - 1], t));
  return poses;
}

const BAR_FRAME_Y = 520;

/**
 * Front-view muscle-up pose in a portrait frame. `height` is the shoulder
 * height above the hands in arm lengths: -1 = dead hang, +1 = locked-out
 * support over the bar. Elbows bend as the shoulders get close to the bar.
 * `standing` puts the athlete on the floor with hands at the hips.
 */
export function barPose(height: number, timestampMs = 0, standing = false): Pose {
  const reach = Math.min(1, Math.max(0.34, Math.abs(height)));
  const half = Math.asin(reach); // half the elbow angle
  const drop = 2 * HANG_ARM * reach;
  const direction = height >= 0 ? -1 : 1; // shoulders above (-y) or below (+y) the hands
  const px: Partial<Record<(typeof KEYPOINT_NAMES)[number], [number, number]>> = {};

  for (const [side, x, out] of [
    ['left', 300, -1],
    ['right', 420, 1],
  ] as const) {
    const shoulder: [number, number] = standing ? [x, 600] : [x, BAR_FRAME_Y + direction * drop];
    const wrist: [number, number] = standing ? [x, 600 + 2 * HANG_ARM] : [x, BAR_FRAME_Y];
    const elbow: [number, number] = standing
      ? [x, 600 + HANG_ARM]
      : [x + out * HANG_ARM * Math.cos(half), (shoulder[1] + wrist[1]) / 2];
    px[`${side}Shoulder`] = shoulder;
    px[`${side}Wrist`] = wrist;
    px[`${side}Elbow`] = elbow;
    px[`${side}Hip`] = [x, shoulder[1] + 250];
    px[`${side}Knee`] = [x, shoulder[1] + 400];
    px[`${side}Ankle`] = [x, shoulder[1] + 520];
    px[`${side}Eye`] = [x - out * 30, shoulder[1] - HEAD_HEIGHT - 10];
    px[`${side}Ear`] = [x - out * 10, shoulder[1] - HEAD_HEIGHT];
  }
  px.nose = [360, px.leftShoulder![1] - HEAD_HEIGHT];

  const keypoints = {} as Keypoints;
  for (const name of KEYPOINT_NAMES) {
    const [x, y] = px[name] ?? [0, 0];
    keypoints[name] = { x: x / HANG_FRAME_W, y: y / HANG_FRAME_H, score: 0.9 };
  }
  return { keypoints, frameWidth: HANG_FRAME_W, frameHeight: HANG_FRAME_H, timestampMs };
}
