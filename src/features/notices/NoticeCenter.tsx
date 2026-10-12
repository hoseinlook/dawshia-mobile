import { router, usePathname, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '../../i18n/useI18n';
import { useServices } from '../../services/ServicesProvider';
import type { ServerNotification } from '../../services/remote/notifications';
import { AppText } from '../../ui/components/AppText';
import { Avatar } from '../../ui/components/Avatar';
import { Icon } from '../../ui/components/Icon';
import { haptics } from '../../ui/haptics';
import { colors, radius, spacing } from '../../ui/theme';
import { useAuth } from '../auth/AuthProvider';
import { useAvatar } from '../avatar/avatars';
import { useSettings } from '../settings/SettingsProvider';
import { useFriends } from '../social/FriendsProvider';
import { useNotifications } from '../social/NotificationsProvider';
import { describeNotice, type Notice } from './describeNotice';
import {
  getNotifyPermission,
  isAppInForeground,
  requestNotifyPermission,
  showSystemNotification,
  onSystemNotificationTap,
} from './systemNotifications';

const SHOW_MS = 6000;

/**
 * Tells the user about social events:
 * - friend requests and accepted requests: a banner at the top of any screen except a match
 *   (fights and messages have their own cards over the tabs), and the Friends badge updates;
 * - while the app is in the background: a phone (or browser) notification for friend
 *   requests, accepted requests, fights and messages; tapping it opens the right screen.
 */
export function NoticeCenter() {
  const { m, dir } = useI18n();
  const { status } = useAuth();
  const { settings } = useSettings();
  const { refresh } = useFriends();
  const pathname = usePathname();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => onSystemNotificationTap((path) => router.push(path as Href)), []);

  // Signed in on a phone: ask once for notification permission (Android 13+ / iOS prompt).
  // Browsers only ask from the Settings switch, where the user clicked.
  const enabled = settings.notificationsEnabled;
  useEffect(() => {
    if (status !== 'signedIn' || !enabled || Platform.OS === 'web') return;
    getNotifyPermission()
      .then((p) => (p === 'undetermined' ? requestNotifyPermission() : p))
      .catch(() => {});
  }, [status, enabled]);

  const onNotification = useCallback(
    (n: ServerNotification) => {
      const next = describeNotice(n, m);
      if (!next) return;
      if (next.kind === 'friendRequest' || next.kind === 'friendAccepted') {
        refresh(); // badge and Friends list right away, not at the next 30 s poll
        haptics.select();
        setNotice(next);
      }
      if (enabled && !isAppInForeground()) showSystemNotification(next).catch(() => {});
    },
    [m, refresh, enabled],
  );
  useNotifications(onNotification);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [notice]);

  // Never cover a match.
  if (!notice || pathname.startsWith('/session')) return null;
  const open = () => {
    setNotice(null);
    router.push(notice.path as Href);
  };
  return (
    <SafeAreaView edges={['top']} style={styles.wrap} pointerEvents="box-none">
      <NoticeCard notice={notice} dir={dir} onPress={open} onClose={() => setNotice(null)} closeLabel={m.notices.dismiss} />
    </SafeAreaView>
  );
}

function NoticeCard({
  notice,
  dir,
  onPress,
  onClose,
  closeLabel,
}: {
  notice: Notice;
  dir: ReturnType<typeof useI18n>['dir'];
  onPress: () => void;
  onClose: () => void;
  closeLabel: string;
}) {
  const { social } = useServices();
  const { friends } = useFriends();
  const avatarAt = friends?.find((f) => f.userId === notice.userId)?.avatarAt;
  const avatar = useAvatar(social, notice.userId, avatarAt);
  const request = notice.kind === 'friendRequest';

  return (
    <View style={[styles.card, dir]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${notice.title}. ${notice.body}`}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <View>
          <Avatar image={avatar} name={notice.username} ringColor={colors.accent} />
          <View style={styles.kind}>
            <Icon name={request ? 'account-plus' : 'account-check'} size="sm" color={colors.onAccent} />
          </View>
        </View>
        <View style={styles.text}>
          <AppText variant="bodyBold" start numberOfLines={2}>
            {notice.title}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} start numberOfLines={1}>
            {notice.body}
          </AppText>
        </View>
      </Pressable>
      <Pressable
        onPress={onClose}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        style={styles.close}
      >
        <Icon name="close" size="sm" color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: spacing.md,
    right: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingStart: spacing.md,
    paddingEnd: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  kind: {
    position: 'absolute',
    end: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
