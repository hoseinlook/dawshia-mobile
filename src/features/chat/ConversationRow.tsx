import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { timeAgo } from '../../i18n/activity';
import { useI18n } from '../../i18n/useI18n';
import { useServices } from '../../services/ServicesProvider';
import type { ChatPartner } from '../../services/types';
import { AppText } from '../../ui/components/AppText';
import { Avatar } from '../../ui/components/Avatar';
import { colors, radius, spacing } from '../../ui/theme';
import { useAvatar } from '../avatar/avatars';
import { conversationAt, daysBetween } from './chatFormat';

/** One conversation in the Messages list: who, the newest message and when, unread count. */
export const ConversationRow = memo(function ConversationRow({
  partner,
  unread,
  myId,
}: {
  partner: ChatPartner;
  unread: number;
  myId: string | undefined;
}) {
  const { m, f, n } = useI18n();
  const { social } = useServices();
  const avatar = useAvatar(social, partner.userId, partner.avatarAt);

  const last = partner.lastMessage;
  const preview = last
    ? last.senderId === myId
      ? f(m.messages.youPrefix, { text: last.text })
      : last.text
    : partner.lastPlayedAt
      ? f(m.messages.lastMatch, { when: timeAgo(m, f, partner.lastPlayedAt) })
      : m.messages.noMessages;
  const when = shortWhen(conversationAt(partner), n, m.messages.yesterday);
  const hasUnread = unread > 0;
  const status = partner.online ? m.friends.online : m.friends.offline;

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/chat/[userId]', params: { userId: partner.userId, username: partner.username } })
      }
      accessibilityRole="button"
      accessibilityLabel={[
        partner.username,
        status,
        hasUnread ? f(m.messages.newCount, { n: unread }) : null,
        preview,
        when,
      ]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [styles.row, hasUnread && styles.rowUnread, pressed && styles.pressed]}
    >
      <Avatar image={avatar} name={partner.username} size={52} online={partner.online} />
      <View style={styles.text}>
        <View style={styles.topLine}>
          <AppText variant="bodyBold" start numberOfLines={1} style={styles.name}>
            {partner.username}
          </AppText>
          <AppText variant="caption" color={hasUnread ? colors.accent : colors.textMuted}>
            {when}
          </AppText>
        </View>
        <View style={styles.bottomLine}>
          <AppText
            variant={hasUnread ? 'bodyBold' : 'caption'}
            color={hasUnread ? colors.text : colors.textMuted}
            start
            numberOfLines={1}
            style={styles.preview}
          >
            {preview}
          </AppText>
          {hasUnread ? (
            <View style={styles.badge}>
              <AppText variant="label" color={colors.onAccent}>
                {n(unread > 99 ? '99+' : unread)}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

/** "14:05" today, "Yesterday", or "3/10" for older days. */
function shortWhen(at: number, n: (v: number | string) => string, yesterday: string): string {
  if (!at) return '';
  const d = new Date(at);
  const days = daysBetween(at, Date.now());
  if (days <= 0) return n(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  if (days === 1) return yesterday;
  return n(`${d.getDate()}/${d.getMonth() + 1}`);
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  rowUnread: {
    borderColor: colors.accentDim,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    writingDirection: 'ltr',
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  preview: {
    flex: 1,
  },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
});
