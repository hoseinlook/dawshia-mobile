import { useEffect } from 'react';
import { AppState } from 'react-native';

import { NakamaSocket } from '../../services/remote/nakamaSocket';
import { useAuth } from '../auth/AuthProvider';

const RETRY_MS = [2000, 5000, 15000, 30000];

/**
 * Keeps a real-time socket open (with presence status) while the user is signed
 * in and the app is in the foreground, so friends see them as online.
 */
export function usePresence(): void {
  const { manager } = useAuth();

  useEffect(() => {
    if (!manager) return;
    let socket: NakamaSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = async () => {
      if (stopped || socket) return;
      const s = new NakamaSocket();
      try {
        await s.connect(await manager.getToken(), { status: true });
        if (stopped) return s.close();
        socket = s;
        retry = 0;
        s.on('disconnect', () => {
          socket = null;
          schedule();
        });
      } catch {
        schedule();
      }
    };
    const schedule = () => {
      if (stopped || timer) return;
      timer = setTimeout(() => {
        timer = null;
        connect();
      }, RETRY_MS[Math.min(retry++, RETRY_MS.length - 1)]);
    };
    const disconnect = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      socket?.close();
      socket = null;
    };

    if (AppState.currentState === 'active') connect();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') connect();
      else disconnect();
    });
    return () => {
      stopped = true;
      sub.remove();
      disconnect();
    };
  }, [manager]);
}
