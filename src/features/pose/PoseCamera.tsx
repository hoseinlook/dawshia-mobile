import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

import type { Pose } from '../../core/pose/types';
import { usePoseDetection, type PoseDetectionStatus } from './usePoseDetection';

export interface PoseCamera {
  hasPermission: boolean;
  /** Asks for camera access; resolves to whether it was granted. */
  requestPermission: () => Promise<boolean>;
  /** False when the device has no front camera. */
  available: boolean;
  status: PoseDetectionStatus;
  error?: Error;
  /** Full-screen camera preview, cover-scaled (draw the skeleton over it). */
  preview: ReactNode;
}

/**
 * The front camera with pose detection on every frame; `onPose` gets each pose.
 * The web build (PoseCamera.web.tsx) uses the browser's webcam and TensorFlow.js.
 */
export function usePoseCamera(onPose: (pose: Pose | null) => void): PoseCamera {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const detection = usePoseDetection(onPose);
  return {
    hasPermission,
    requestPermission,
    available: device != null,
    status: detection.status,
    error: detection.error,
    preview: device ? (
      <Camera style={StyleSheet.absoluteFill} device={device} isActive outputs={[detection.frameOutput]} />
    ) : null,
  };
}
