/**
 * Web build of systemNotifications.ts: the browser's Notification API, shown while the tab is
 * hidden. Browsers without the page-level constructor (Chrome on Android needs a service
 * worker) simply show nothing; the in-app banners still work.
 */

export type NotifyPermission = 'granted' | 'denied' | 'undetermined';

const supported = () => typeof window !== 'undefined' && 'Notification' in window;

function current(): NotifyPermission {
  if (!supported()) return 'denied';
  const p = Notification.permission;
  return p === 'default' ? 'undetermined' : p;
}

export async function getNotifyPermission(): Promise<NotifyPermission> {
  return current();
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (!supported()) return 'denied';
  try {
    await Notification.requestPermission();
  } catch {
    // Old Safari: callback-only API; treat as not granted.
  }
  return current();
}

export function isAppInForeground(): boolean {
  return document.visibilityState === 'visible';
}

let openPath: ((path: string) => void) | null = null;

export async function showSystemNotification(n: { title: string; body: string; path: string }): Promise<void> {
  if (current() !== 'granted') return;
  try {
    const shown = new Notification(n.title, {
      body: n.body,
      tag: n.path, // a newer one for the same chat/friend replaces the old
      icon: `${process.env.EXPO_BASE_URL ?? ''}/favicon.ico`,
    });
    shown.onclick = () => {
      window.focus();
      shown.close();
      openPath?.(n.path);
    };
  } catch {
    // Not supported in this browser.
  }
}

export function onSystemNotificationTap(open: (path: string) => void): () => void {
  openPath = open;
  return () => {
    if (openPath === open) openPath = null;
  };
}
