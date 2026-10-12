import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-webgl';
import { loadGraphModel, type GraphModel } from '@tensorflow/tfjs-converter';

/**
 * Web build of poseEngine.ts: MoveNet SinglePose Lightning as a TensorFlow.js graph model
 * on the WebGL backend. Same input/output tensors as the TFLite model, so decodeMoveNet works
 * unchanged. The model is served with the web app (public/models/movenet), not from Google.
 */
export interface PoseEngine {
  model: GraphModel;
}

const MODEL_URL = `${process.env.EXPO_BASE_URL ?? ''}/models/movenet/model.json`;

let enginePromise: Promise<PoseEngine> | null = null;

export function preloadPoseEngine(): Promise<PoseEngine> {
  enginePromise ??= (async () => {
    // WebGL (GPU) where available; the CPU backend is a slow fallback.
    if (!(await tf.setBackend('webgl'))) await tf.setBackend('cpu');
    await tf.ready();
    const model = await loadGraphModel(MODEL_URL);
    return { model };
  })().catch((e: unknown) => {
    enginePromise = null; // allow a retry next time
    throw e;
  });
  return enginePromise;
}
