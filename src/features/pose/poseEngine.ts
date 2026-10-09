import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';
import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';
import { createResizer, type Resizer } from 'react-native-vision-camera-resizer';

import { MOVENET_INPUT_SIZE, MOVENET_MODEL } from './detectors/moveNet';

/** Everything the camera pipeline needs: the pose model and the GPU frame resizer. */
export interface PoseEngine {
  model: TensorflowModel;
  resizer: Resizer;
}

let enginePromise: Promise<PoseEngine> | null = null;

/**
 * Loads the bundled model from a real file.
 *
 * In release builds the model is packed as an Android resource, which
 * fast-tflite's loader (it only reads URLs) cannot open. expo-asset copies it
 * to a local file once, and we pass the `file://` path instead. In development
 * the same call downloads it from Metro once and caches it.
 */
async function loadPoseModel(): Promise<TensorflowModel> {
  const [asset] = await Asset.loadAsync(MOVENET_MODEL);
  const uri = asset.localUri ?? asset.uri;
  // CPU delegate: MoveNet Lightning is small enough; GPU delegates need extra native config.
  return loadTensorflowModel({ url: uri }, []);
}

/**
 * Loads the pose model and resizer once per app run and shares them between
 * sessions. Call early (app start) so a session can begin without waiting.
 */
export function preloadPoseEngine(): Promise<PoseEngine> {
  enginePromise ??= Promise.all([
    loadPoseModel(),
    createResizer({
      width: MOVENET_INPUT_SIZE,
      height: MOVENET_INPUT_SIZE,
      channelOrder: 'rgb',
      dataType: 'uint8',
      scaleMode: 'contain',
      pixelLayout: 'interleaved',
    }),
  ])
    .then(([model, resizer]) => ({ model, resizer }))
    .catch((e: unknown) => {
      enginePromise = null; // allow a retry next time
      throw e;
    });
  return enginePromise;
}

export type PoseEngineState =
  | { status: 'loading'; engine?: undefined; error?: undefined }
  | { status: 'ready'; engine: PoseEngine; error?: undefined }
  | { status: 'error'; engine?: undefined; error: Error };

/** The shared pose engine; instant when it was preloaded. */
export function usePoseEngine(): PoseEngineState {
  const [state, setState] = useState<PoseEngineState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    preloadPoseEngine().then(
      (engine) => !cancelled && setState({ status: 'ready', engine }),
      (error: Error) => !cancelled && setState({ status: 'error', error }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
