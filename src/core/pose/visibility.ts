import { KEYPOINT_NAMES, type Keypoints } from './types';

/** Average keypoint confidence below which we report "no person"… */
const MIN_POSE_SCORE = 0.2;
/** …unless this many keypoints are confident on their own (e.g. a front plank hides the legs). */
const MIN_CONFIDENT_KEYPOINTS = 6;
const CONFIDENT_SCORE = 0.3;

/** Whether the decoded keypoints show a person at all. */
export function isPoseVisible(keypoints: Keypoints): boolean {
  'worklet';
  let scoreSum = 0;
  let confident = 0;
  for (let i = 0; i < KEYPOINT_NAMES.length; i++) {
    const score = keypoints[KEYPOINT_NAMES[i]].score;
    scoreSum += score;
    if (score >= CONFIDENT_SCORE) confident++;
  }
  return scoreSum / KEYPOINT_NAMES.length >= MIN_POSE_SCORE || confident >= MIN_CONFIDENT_KEYPOINTS;
}
