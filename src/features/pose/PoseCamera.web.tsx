import * as tf from '@tensorflow/tfjs-core';
import { createElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Pose } from '../../core/pose/types';
import { decodeMoveNet, isPoseVisible, MOVENET_INPUT_SIZE } from './detectors/moveNet';
import { preloadPoseEngine, type PoseEngine } from './poseEngine.web';

type PoseDetectionStatus = 'loading' | 'ready' | 'error';

/** Same shape as PoseCamera.tsx. */
export interface PoseCamera {
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;
  available: boolean;
  status: PoseDetectionStatus;
  error?: Error;
  preview: ReactNode;
}

/** Frames per second sent to the model; the webcam usually runs at 30. */
const MAX_FPS = 30;

/** Shows the webcam stream in the <video> element (a DOM node, not React state). */
function playStream(video: HTMLVideoElement, stream: MediaStream): void {
  if (video.srcObject === stream) return;
  video.srcObject = stream;
  video.play().catch(() => {});
}

const hasWebcam = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * Web build of PoseCamera.tsx: the browser's front webcam, mirrored like a selfie camera,
 * with MoveNet (TensorFlow.js) on every frame. Keypoints are mirrored too, so the skeleton
 * lines up with the preview. Needs HTTPS (or localhost) for camera access.
 */
export function usePoseCamera(onPose: (pose: Pose | null) => void): PoseCamera {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [engine, setEngine] = useState<PoseEngine | null>(null);
  const [error, setError] = useState<Error | undefined>();
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);

  const onPoseRef = useRef(onPose);
  useEffect(() => {
    onPoseRef.current = onPose;
  }, [onPose]);

  const requestPermission = useCallback(async () => {
    if (!hasWebcam()) return false;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(media);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Stop the webcam when the session screen closes.
  useEffect(() => {
    if (!stream) return;
    return () => stream.getTracks().forEach((t) => t.stop());
  }, [stream]);

  useEffect(() => {
    let cancelled = false;
    preloadPoseEngine().then(
      (e) => !cancelled && setEngine(e),
      (e: unknown) => !cancelled && setError(e instanceof Error ? e : new Error(String(e))),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Detection loop: letterbox the frame to 192×192 (like the native resizer), run, decode.
  useEffect(() => {
    if (!engine || !video) return;
    let stopped = false;
    let busy = false;
    let last = 0;
    let raf = 0;
    const size = MOVENET_INPUT_SIZE;

    const tick = async (now: number) => {
      raf = requestAnimationFrame(tick);
      if (busy || now - last < 1000 / MAX_FPS || video.readyState < 2 || !video.videoWidth) return;
      busy = true;
      last = now;
      const frameWidth = video.videoWidth;
      const frameHeight = video.videoHeight;
      try {
        const output = tf.tidy(() => {
          const frame = tf.browser.fromPixels(video);
          const scale = size / Math.max(frameWidth, frameHeight);
          const w = Math.round(frameWidth * scale);
          const h = Math.round(frameHeight * scale);
          const top = Math.floor((size - h) / 2);
          const left = Math.floor((size - w) / 2);
          const resized = tf.image.resizeBilinear(frame, [h, w]);
          const padded = tf.pad(resized, [
            [top, size - h - top],
            [left, size - w - left],
            [0, 0],
          ]);
          return engine.model.execute(tf.expandDims(tf.cast(padded, 'int32'), 0)) as tf.Tensor;
        });
        const data = (await output.data()) as Float32Array;
        output.dispose();
        if (stopped) return;
        const keypoints = decodeMoveNet(data, frameWidth, frameHeight);
        for (const k of Object.values(keypoints)) k.x = 1 - k.x; // match the mirrored preview
        onPoseRef.current(
          isPoseVisible(keypoints) ? { keypoints, frameWidth, frameHeight, timestampMs: Date.now() } : null,
        );
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        busy = false;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [engine, video]);

  useEffect(() => {
    if (video && stream) playStream(video, stream);
  }, [video, stream]);

  return {
    hasPermission: stream !== null,
    requestPermission,
    available: hasWebcam(),
    status: error ? 'error' : engine ? 'ready' : 'loading',
    error,
    preview: stream ? (
      <View style={StyleSheet.absoluteFill}>
        {createElement('video', {
          ref: setVideo,
          autoPlay: true,
          playsInline: true,
          muted: true,
          style: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
        })}
      </View>
    ) : null,
  };
}
