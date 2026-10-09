import { memo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { KeypointName, Pose } from '../../core/pose/types';
import { colors } from '../../ui/theme';
import { frameToViewPoint, type Size } from './mapToView';

const BONES: readonly [KeypointName, KeypointName][] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

const MIN_SCORE = 0.3;
const JOINT_SIZE = 10;
const BONE_WIDTH = 4;

interface Props {
  pose: Pose | null;
  color?: string;
}

/** Draws the detected skeleton over a full-screen, cover-scaled camera preview. */
export const SkeletonOverlay = memo(function SkeletonOverlay({
  pose,
  color = colors.accent,
}: Props) {
  const [view, setView] = useState<Size | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setView(e.nativeEvent.layout);

  const frame = pose ? { width: pose.frameWidth, height: pose.frameHeight } : null;
  const point = (name: KeypointName) => {
    const k = pose!.keypoints[name];
    return frameToViewPoint(k.x, k.y, frame!, view!);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {pose && view
        ? BONES.map(([a, b]) => {
            if (pose.keypoints[a].score < MIN_SCORE || pose.keypoints[b].score < MIN_SCORE) {
              return null;
            }
            const p1 = point(a);
            const p2 = point(b);
            const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            return (
              <View
                key={`${a}-${b}`}
                style={[
                  styles.bone,
                  {
                    backgroundColor: color,
                    width: length,
                    left: (p1.x + p2.x) / 2 - length / 2,
                    top: (p1.y + p2.y) / 2 - BONE_WIDTH / 2,
                    transform: [{ rotate: `${angle}rad` }],
                  },
                ]}
              />
            );
          })
        : null}
      {pose && view
        ? (Object.keys(pose.keypoints) as KeypointName[]).map((name) => {
            if (pose.keypoints[name].score < MIN_SCORE) return null;
            const p = point(name);
            return (
              <View
                key={name}
                style={[
                  styles.joint,
                  { borderColor: color, left: p.x - JOINT_SIZE / 2, top: p.y - JOINT_SIZE / 2 },
                ]}
              />
            );
          })
        : null}
    </View>
  );
});

const styles = StyleSheet.create({
  bone: {
    position: 'absolute',
    height: BONE_WIDTH,
    borderRadius: BONE_WIDTH / 2,
    opacity: 0.85,
  },
  joint: {
    position: 'absolute',
    width: JOINT_SIZE,
    height: JOINT_SIZE,
    borderRadius: JOINT_SIZE / 2,
    borderWidth: 2,
    backgroundColor: '#fff',
  },
});
