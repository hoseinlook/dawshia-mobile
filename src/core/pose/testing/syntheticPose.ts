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

export interface HandstandOptions {
  /** Elbow angle in degrees (180 = locked). */
  elbowAngle?: number;
  /** Distance (px) from the shoulders down to the nose; smaller = head stays higher. */
  headOffset?: number;
  /** Degrees the body leans away from vertical. */
  lean?: number;
  /** Upright standing pose instead of inverted. */
  standing?: boolean;
  timestampMs?: number;
}

/** Side-ish view of a handstand in a portrait frame (hands on the floor at y=1150). */
export function handstandPose({ elbowAngle = 175, headOffset = 90, lean = 0, standing = false, timestampMs = 0 }: HandstandOptions = {}): Pose {
  const px: Partial<Record<(typeof KEYPOINT_NAMES)[number], [number, number]>> = {};
  const floor = 1150;
  const half = (elbowAngle * Math.PI) / 360;
  const armSpan = 2 * HANG_ARM * Math.sin(half);
  const rad = (lean * Math.PI) / 180;
  for (const [side, x, out] of [
    ['left', 340, -1],
    ['right', 380, 1],
  ] as const) {
    if (standing) {
      px[`${side}Ankle`] = [x, 1150];
      px[`${side}Knee`] = [x, 1000];
      px[`${side}Hip`] = [x, 850];
      px[`${side}Shoulder`] = [x, 600];
      px[`${side}Elbow`] = [x, 710];
      px[`${side}Wrist`] = [x, 820];
      px[`${side}Eye`] = [x, 520];
      px[`${side}Ear`] = [x, 530];
      continue;
    }
    const wrist: [number, number] = [x, floor];
    const shoulder: [number, number] = [x, floor - armSpan];
    const elbow: [number, number] = [x + out * HANG_ARM * Math.cos(half), floor - armSpan / 2];
    // Body goes up from the shoulders, tilted by `lean`.
    const along = (d: number): [number, number] => [shoulder[0] + Math.sin(rad) * d, shoulder[1] - Math.cos(rad) * d];
    px[`${side}Wrist`] = wrist;
    px[`${side}Shoulder`] = shoulder;
    px[`${side}Elbow`] = elbow;
    px[`${side}Hip`] = along(250);
    px[`${side}Knee`] = along(400);
    px[`${side}Ankle`] = along(520);
    px[`${side}Eye`] = [x, shoulder[1] + 80];
    px[`${side}Ear`] = [x, shoulder[1] + 70];
  }
  px.nose = standing ? [360, 525] : [360, px.leftShoulder![1] + headOffset];

  const keypoints = {} as Keypoints;
  for (const name of KEYPOINT_NAMES) {
    const [x, y] = px[name] ?? [0, 0];
    keypoints[name] = { x: x / HANG_FRAME_W, y: y / HANG_FRAME_H, score: 0.9 };
  }
  return { keypoints, frameWidth: HANG_FRAME_W, frameHeight: HANG_FRAME_H, timestampMs };
}

type Points = Partial<Record<(typeof KEYPOINT_NAMES)[number], [number, number]>>;

/** Same points for both sides (side view), left side more confident. */
function sideViewFrom(points: Record<string, [number, number]>, timestampMs: number): Pose {
  const keypoints = {} as Keypoints;
  const px: Points = {};
  for (const [joint, xy] of Object.entries(points)) {
    if (joint === 'nose') px.nose = xy;
    else {
      const cap = joint.charAt(0).toUpperCase() + joint.slice(1);
      px[`left${cap}` as keyof Points] = xy;
      px[`right${cap}` as keyof Points] = xy;
    }
  }
  for (const name of KEYPOINT_NAMES) {
    const [x, y] = px[name] ?? [0, 0];
    keypoints[name] = { x: x / HANG_FRAME_W, y: y / HANG_FRAME_H, score: name.startsWith('right') ? 0.5 : 0.9 };
  }
  return { keypoints, frameWidth: HANG_FRAME_W, frameHeight: HANG_FRAME_H, timestampMs };
}

/** Side-view dip on parallel bars: forearm vertical, upper arm rotating with the elbow angle. */
export function dipPose(elbowAngle: number, timestampMs = 0, lying = false): Pose {
  if (lying) {
    return sideViewFrom(
      { shoulder: [200, 900], elbow: [200, 1000], wrist: [200, 1100], hip: [450, 900], knee: [600, 900], ankle: [750, 900], nose: [110, 900] },
      timestampMs,
    );
  }
  const wrist: [number, number] = [360, 700];
  const elbow: [number, number] = [360, 700 - HANG_ARM];
  const t = (elbowAngle * Math.PI) / 180;
  const shoulder: [number, number] = [elbow[0] + HANG_ARM * Math.sin(t), elbow[1] + HANG_ARM * Math.cos(t)];
  const hip: [number, number] = [shoulder[0], shoulder[1] + 250];
  return sideViewFrom(
    {
      wrist,
      elbow,
      shoulder,
      hip,
      knee: [hip[0] + 30, hip[1] + 150],
      ankle: [hip[0] + 30, hip[1] + 300],
      nose: [shoulder[0] + 20, shoulder[1] - HEAD_HEIGHT],
    },
    timestampMs,
  );
}

/** Side-view L-sit: hands on the floor, torso up, legs out at `legDrop` degrees below horizontal. */
export function lsitPose({ legDrop = 0, elbowAngle = 175, timestampMs = 0 } = {}): Pose {
  const half = (elbowAngle * Math.PI) / 360;
  const span = 2 * HANG_ARM * Math.sin(half);
  const wrist: [number, number] = [400, 1000];
  const shoulder: [number, number] = [400, 1000 - span];
  const elbow: [number, number] = [400 - HANG_ARM * Math.cos(half), 1000 - span / 2];
  const hip: [number, number] = [shoulder[0] + 10, shoulder[1] + 200];
  const d = (legDrop * Math.PI) / 180;
  return sideViewFrom(
    {
      wrist,
      elbow,
      shoulder,
      hip,
      knee: [hip[0] + Math.cos(d) * 170, hip[1] + Math.sin(d) * 170],
      ankle: [hip[0] + Math.cos(d) * 340, hip[1] + Math.sin(d) * 340],
      nose: [shoulder[0], shoulder[1] - HEAD_HEIGHT],
    },
    timestampMs,
  );
}

/** Side-view front lever: hands on a bar, body at `drop` degrees below horizontal, legs piked by `pike`. */
export function frontLeverPose({ drop = 0, pike = 0, elbowAngle = 175, timestampMs = 0 } = {}): Pose {
  const half = (elbowAngle * Math.PI) / 360;
  const span = 2 * HANG_ARM * Math.sin(half);
  const wrist: [number, number] = [100, 300];
  const shoulder: [number, number] = [100, 300 + span];
  const elbow: [number, number] = [100 - HANG_ARM * Math.cos(half), 300 + span / 2];
  const d = (drop * Math.PI) / 180;
  const l = ((drop + pike) * Math.PI) / 180;
  const hip: [number, number] = [shoulder[0] + Math.cos(d) * 250, shoulder[1] + Math.sin(d) * 250];
  return sideViewFrom(
    {
      wrist,
      elbow,
      shoulder,
      hip,
      knee: [hip[0] + Math.cos(l) * 135, hip[1] + Math.sin(l) * 135],
      ankle: [hip[0] + Math.cos(l) * 270, hip[1] + Math.sin(l) * 270],
      nose: [shoulder[0] - 80, shoulder[1]],
    },
    timestampMs,
  );
}
