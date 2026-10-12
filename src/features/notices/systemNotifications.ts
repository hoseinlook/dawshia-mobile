import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

/**
 * Phone notifications (expo-notifications), shown while Dawshia is in the background and its
 * socket still delivers server notifications. They are local notifications, so no push service
 * (FCM/APNs) is involved. The web build uses the browser's Notification API
 * (systemNotifications.web.ts).
 */

export type NotifyPermission = 'granted' | 'denied' | 'undetermined';

const CHANNEL = 'social';

// In the foreground the app shows its own banners instead.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function toPermission(status: Notifications.NotificationPermissionsStatus): NotifyPermission {
  if (status.granted) return 'granted';
  return status.canAskAgain ? 'undetermined' : 'denied';
}

export async function getNotifyPermission(): Promise<NotifyPermission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

/** Asks for permission (Android 13+ and iOS show a prompt once). */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (Platform.OS === 'android') {
    // Android needs the channel before it can prompt.
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Friends & fights',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
    });
  }
  return toPermission(await Notifications.requestPermissionsAsync());
}

/** True while the user is looking at the app (no system notification needed). */
export function isAppInForeground(): boolean {
  return AppState.currentState === 'active';
}

export async function showSystemNotification(n: { title: string; body: string; path: string }): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: n.title, body: n.body, data: { path: n.path } },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
}

/** Calls `open` with the app path of a notification the user tapped (also after a cold start). */
export function onSystemNotificationTap(open: (path: string) => void): () => void {
  const handle = (response: Notifications.NotificationResponse | null) => {
    const path = response?.notification.request.content.data?.path;
    if (typeof path !== 'string') return;
    Notifications.clearLastNotificationResponse();
    open(path);
  };
  handle(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
