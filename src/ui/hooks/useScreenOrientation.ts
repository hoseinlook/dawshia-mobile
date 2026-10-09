import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';

/** Locks the screen to the given orientation while the component is mounted. */
export function useScreenOrientation(orientation: 'landscape' | 'portrait') {
  useEffect(() => {
    ScreenOrientation.lockAsync(
      orientation === 'landscape'
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [orientation]);
}
