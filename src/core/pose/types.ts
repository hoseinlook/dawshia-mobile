/**
 * Model-agnostic pose representation.
 *
 * Every pose detector (MoveNet, MediaPipe, Apple Vision, ...) is adapted to
 * this shape, so exercise logic never depends on a specific ML model.
 */

export const KEYPOINT_NAMES = [
  'nose',
  'leftEye',
  'rightEye',
  'leftEar',
  'rightEar',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftHip',
  'rightHip',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
] as const;

export type KeypointName = (typeof KEYPOINT_NAMES)[number];

export interface Keypoint {
  /** Horizontal position, normalized to the upright camera frame (0 = left, 1 = right). */
  x: number;
  /** Vertical position, normalized to the upright camera frame (0 = top, 1 = bottom). */
  y: number;
  /** Detector confidence, 0..1. */
  score: number;
}

export type Keypoints = Record<KeypointName, Keypoint>;

export interface Pose {
  keypoints: Keypoints;
  /** Size of the upright frame the coordinates are normalized to, in pixels. */
  frameWidth: number;
  frameHeight: number;
  /** Capture time in milliseconds (monotonic clock of the producer). */
  timestampMs: number;
}

export type BodySide = 'left' | 'right';
