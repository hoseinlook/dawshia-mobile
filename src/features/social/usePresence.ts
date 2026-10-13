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
 * After the app leaves the screen, the user still shows as online this long, so a quick
 * switch to another app doesn't hide them and fight requests still reach them (as a phone
 * notification). An open browser tab stays online.
 */
const ONLINE_GRACE_MS = Platform.OS === 'web' ? Infinity : 2 * 60_000;

/**
 * Keeps a real-time socket open while the user is signed in. In the foreground (and
 * ONLINE_GRACE_MS after leaving it) it carries presence status, so other players see them
 * as online and can challenge them; then it reconnects without status for a while (BACKGROUND_MS). Server notifications (friend requests, fights, chat)
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
    // Whether the socket carries online status (foreground, or shortly after).
    let online = foreground;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (stopped || socket) return;
      const status = online;
      const s = new NakamaSocket();
      try {
        await s.connect(await manager.getToken(), { status });
        // Stopped, or the online status changed while connecting.
        if (stopped || status !== online || socket) {
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
      if (quietTimer) clearTimeout(quietTimer);
      if (graceTimer) clearTimeout(graceTimer);
      quietTimer = graceTimer = null;
      if (foreground) {
        if (!online) {
          // Back from a quiet socket: reconnect with online status.
          online = true;
          disconnect();
        }
        connect();
        return;
      }
      backgroundSince = Date.now();
      // Online a little longer, then a quiet socket (no status), then nothing.
      if (Number.isFinite(ONLINE_GRACE_MS)) {
        graceTimer = setTimeout(() => {
          graceTimer = null;
          online = false;
          disconnect();
          connect();
        }, ONLINE_GRACE_MS);
      }
      if (Number.isFinite(BACKGROUND_MS)) quietTimer = setTimeout(disconnect, BACKGROUND_MS);
      connect();
    });
    return () => {
      stopped = true;
      sub.remove();
      if (quietTimer) clearTimeout(quietTimer);
      if (graceTimer) clearTimeout(graceTimer);
      disconnect();
    };
  }, [manager]);
}
