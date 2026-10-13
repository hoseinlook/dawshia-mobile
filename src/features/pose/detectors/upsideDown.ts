/**
 * Upside-down bodies (handstands): MoveNet has mostly seen people standing, so for an inverted
 * athlete it often returns an "upright" skeleton with the feet on the hands. Running it on the
 * frame rotated by 180° shows them standing, which it reads well. For inverted exercises the
 * detector runs both and keeps the more confident result (see the video tests in
 * scripts/video-eval, where this took a side-view handstand from 0 % to 96 % detected).
 */

/** The model input (RGB, interleaved, square) rotated by 180°. */
export function rotateInput180(input: Uint8Array): Uint8Array {
  'worklet';
  const pixels = input.length / 3;
  const out = new Uint8Array(input.length);
  for (let i = 0; i < pixels; i++) {
    const j = (pixels - 1 - i) * 3;
    out[i * 3] = input[j];
    out[i * 3 + 1] = input[j + 1];
    out[i * 3 + 2] = input[j + 2];
  }
  return out;
}

function meanScore(output: Float32Array): number {
  'worklet';
  let sum = 0;
  for (let i = 2; i < output.length; i += 3) sum += output[i];
  return sum / (output.length / 3);
}

/**
 * Picks the more confident of the normal and the rotated MoveNet outputs ([y, x, score] × 17,
 * normalized to the model input); the rotated one is turned back to the original orientation.
 */
export function selectUpright(normal: Float32Array, rotated: Float32Array): Float32Array {
  'worklet';
  if (meanScore(rotated) <= meanScore(normal)) return normal;
  const out = new Float32Array(rotated.length);
  for (let i = 0; i < rotated.length; i += 3) {
    out[i] = 1 - rotated[i];
    out[i + 1] = 1 - rotated[i + 1];
    out[i + 2] = rotated[i + 2];
  }
  return out;
}
