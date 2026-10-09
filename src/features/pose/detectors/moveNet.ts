import { KEYPOINT_NAMES, type Keypoints } from '../../../core/pose/types';

/**
 * MoveNet SinglePose Lightning (TFLite, float16 weights).
 *   input:  uint8  [1, 192, 192, 3]  RGB, interleaved
 *   output: float32 [1, 1, 17, 3]    (y, x, score) per COCO keypoint, normalized to the input
 * COCO keypoint order matches `KEYPOINT_NAMES`.
 */
export const MOVENET_INPUT_SIZE = 192;
export const MOVENET_INPUT_BYTES = MOVENET_INPUT_SIZE * MOVENET_INPUT_SIZE * 3;

// eslint-disable-next-line @typescript-eslint/no-require-imports
export const MOVENET_MODEL = require('../../../../assets/models/movenet_lightning_f16.tflite');

/**
 * Decodes MoveNet output into keypoints normalized to the upright camera frame.
 *
 * The frame is fed to the model letterboxed ("contain" scale mode), so model
 * coordinates are converted back by removing the black bars.
 */
export function decodeMoveNet(
  output: Float32Array,
  frameWidth: number,
  frameHeight: number,
): Keypoints {
  'worklet';
  // Fraction of the square model input actually covered by the frame.
  const aspect = frameWidth / frameHeight;
  const contentW = aspect >= 1 ? 1 : aspect;
  const contentH = aspect >= 1 ? 1 / aspect : 1;
  const offsetX = (1 - contentW) / 2;
  const offsetY = (1 - contentH) / 2;

  const keypoints = {} as Keypoints;
  for (let i = 0; i < KEYPOINT_NAMES.length; i++) {
    const y = output[i * 3];
    const x = output[i * 3 + 1];
    const score = output[i * 3 + 2];
    keypoints[KEYPOINT_NAMES[i]] = {
      x: (x - offsetX) / contentW,
      y: (y - offsetY) / contentH,
      score,
    };
  }
  return keypoints;
}
