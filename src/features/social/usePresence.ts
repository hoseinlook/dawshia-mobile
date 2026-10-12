import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { NakamaSocket } from '../../services/remote/nakamaSocket';
import { useAuth } from '../auth/AuthProvider';

const RETRY_MS = [2000, 5000, 15000, 30000];
/**
 * After the app leaves the screen, a quiet socket (no online status) keeps receiving
 * notifications this long, so they can show as phone notifications. Browser tabs keep it.
 */
const BACKGROUND_MS = Platform.OS === 'web' ? Infinity : 10 * 60_000;

/**
 * Keeps a real-time socket open while the user is signed in. In the foreground it carries
 * presence status, so friends see them as online; in the background it reconnects without
 * status for a while (BACKGROUND_MS). Server notifications (friend requests, fights, chat)
 * arrive on it and go to `onNotifications`.
 */
export function usePresence(onNotifications?: (payload: unknown) => void): void {
  const { manager } = useAuth();
  const onNotificationsRef = useRef(onNotifications);
  useEffect(() => {
    onNotificationsRef.current = onNotifications;
  }, [onNotifications]);

  useEffect(() => {
    if (!manager) return;
    let socket: NakamaSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    // 'inactive' (iOS control center, app switcher) still counts as foreground.
    let foreground = AppState.currentState !== 'background';
    let backgroundSince = 0;
    let quietTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (stopped || socket) return;
      const status = foreground;
      const s = new NakamaSocket();
      try {
        await s.connect(await manager.getToken(), { status });
        // Stopped, or the app moved between foreground and background while connecting.
        if (stopped || status !== foreground || socket) {
          s.close();
          if (!stopped && !socket) connect();
          return;
        }
        socket = s;
        retry = 0;
        s.on('notifications', (payload) => onNotificationsRef.current?.(payload));
        s.on('disconnect', () => {
          if (socket !== s) return; // a socket we replaced or closed on purpose
          socket = null;
          schedule();
        });
      } catch {
        schedule();
      }
    };
    const schedule = () => {
      if (stopped || timer) return;
      if (!foreground && Date.now() - backgroundSince >= BACKGROUND_MS) return;
      timer = setTimeout(
        () => {
          timer = null;
          connect();
        },
        RETRY_MS[Math.min(retry++, RETRY_MS.length - 1)],
      );
    };
    const disconnect = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      socket?.close();
      socket = null;
    };

    connect();
    const sub = AppState.addEventListener('change', (state) => {
      const next = state !== 'background';
      if (next === foreground) return;
      foreground = next;
      // Reconnect with (foreground) or without (background) online status.
      disconnect();
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = null;
      if (!foreground) {
        backgroundSince = Date.now();
        if (Number.isFinite(BACKGROUND_MS)) quietTimer = setTimeout(disconnect, BACKGROUND_MS);
      }
      connect();
    });
    return () => {
      stopped = true;
      sub.remove();
      if (quietTimer) clearTimeout(quietTimer);
      disconnect();
    };
  }, [manager]);
}
