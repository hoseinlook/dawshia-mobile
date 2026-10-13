import { useCallback, useEffect, useRef } from 'react';
import { useFrameOutput, type CameraFrameOutput, type Frame } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';

import type { Keypoints, Pose } from '../../core/pose/types';
import { decodeMoveNet, isPoseVisible, MOVENET_INPUT_BYTES } from './detectors/moveNet';
import { rotateInput180, selectUpright } from './detectors/upsideDown';
import { usePoseEngine } from './poseEngine';

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
export function usePoseDetection(
  onPose: (pose: Pose | null) => void,
  { upsideDown = false }: { upsideDown?: boolean } = {},
): PoseDetection {
  const engine = usePoseEngine();

  // Keep the latest callback without re-creating the frame processor.
  const onPoseRef = useRef(onPose);
  useEffect(() => {
    onPoseRef.current = onPose;
  }, [onPose]);

  const emit = useCallback((keypoints: Keypoints | null, frameWidth: number, frameHeight: number) => {
    onPoseRef.current(keypoints === null ? null : { keypoints, frameWidth, frameHeight, timestampMs: Date.now() });
  }, []);

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
        let output: Float32Array;
        try {
          let input = resized.getPixelBuffer();
          // GPU buffers can be padded; the model expects the exact tensor size.
          if (input.byteLength !== MOVENET_INPUT_BYTES) input = input.slice(0, MOVENET_INPUT_BYTES);
          output = new Float32Array(tflite.runSync([input])[0]);
          if (upsideDown) {
            // Inverted athletes are read better upside down (detectors/upsideDown.ts).
            const rotated = rotateInput180(new Uint8Array(input));
            output = selectUpright(output, new Float32Array(tflite.runSync([rotated.buffer as ArrayBuffer])[0]));
          }
        } finally {
          resized.dispose();
        }

        const keypoints = decodeMoveNet(output, frameWidth, frameHeight);
        scheduleOnRN(emit, isPoseVisible(keypoints) ? keypoints : null, frameWidth, frameHeight);
      } finally {
        frame.dispose();
      }
    },
    [tflite, gpuResizer, emit, upsideDown],
  );

  const frameOutput = useFrameOutput({ pixelFormat: 'yuv', onFrame });

  const status: PoseDetectionStatus = engine.status;
  const error = engine.error;

  return { status, error, frameOutput };
}
