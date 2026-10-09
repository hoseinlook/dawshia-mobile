import { useCallback, useEffect, useRef } from 'react';
import { useFrameOutput, type CameraFrameOutput, type Frame } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';

import type { Keypoints, Pose } from '../../core/pose/types';
import { decodeMoveNet, MOVENET_INPUT_BYTES } from './detectors/moveNet';
import { usePoseEngine } from './poseEngine';

/** Average keypoint confidence below which we report "no person". */
const MIN_POSE_SCORE = 0.2;

export type PoseDetectionStatus = 'loading' | 'ready' | 'error';

export interface PoseDetection {
  status: PoseDetectionStatus;
  error?: Error;
  /** Attach to `<Camera outputs={[...]} />`. */
  frameOutput: CameraFrameOutput;
}

/**
 * Runs on-device pose estimation on every camera frame and calls `onPose`
 * on the JS thread with the detected pose (or `null` when nobody is visible).
 *
 * Pipeline (all on the camera thread):
 *   Frame (YUV) → GPU resize/rotate/letterbox to 192×192 RGB → MoveNet → keypoints
 */
export function usePoseDetection(onPose: (pose: Pose | null) => void): PoseDetection {
  const engine = usePoseEngine();

  // Keep the latest callback without re-creating the frame processor.
  const onPoseRef = useRef(onPose);
  useEffect(() => {
    onPoseRef.current = onPose;
  }, [onPose]);

  const emit = useCallback(
    (keypoints: Keypoints | null, frameWidth: number, frameHeight: number) => {
      onPoseRef.current(
        keypoints === null
          ? null
          : { keypoints, frameWidth, frameHeight, timestampMs: Date.now() },
      );
    },
    [],
  );

  const tflite = engine.engine?.model;
  const gpuResizer = engine.engine?.resizer;

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet';
      try {
        if (tflite == null || gpuResizer == null) return;

        const sideways = frame.orientation === 'left' || frame.orientation === 'right';
        const frameWidth = sideways ? frame.height : frame.width;
        const frameHeight = sideways ? frame.width : frame.height;

        const resized = gpuResizer.resize(frame);
        let outputs: ArrayBuffer[];
        try {
          let input = resized.getPixelBuffer();
          // GPU buffers can be padded; the model expects the exact tensor size.
          if (input.byteLength !== MOVENET_INPUT_BYTES) input = input.slice(0, MOVENET_INPUT_BYTES);
          outputs = tflite.runSync([input]);
        } finally {
          resized.dispose();
        }

        const keypoints = decodeMoveNet(new Float32Array(outputs[0]), frameWidth, frameHeight);

        let scoreSum = 0;
        for (const name in keypoints) scoreSum += keypoints[name as keyof Keypoints].score;
        const visible = scoreSum / Object.keys(keypoints).length >= MIN_POSE_SCORE;

        scheduleOnRN(emit, visible ? keypoints : null, frameWidth, frameHeight);
      } finally {
        frame.dispose();
      }
    },
    [tflite, gpuResizer, emit],
  );

  const frameOutput = useFrameOutput({ pixelFormat: 'yuv', onFrame });

  const status: PoseDetectionStatus = engine.status;
  const error = engine.error;

  return { status, error, frameOutput };
}
