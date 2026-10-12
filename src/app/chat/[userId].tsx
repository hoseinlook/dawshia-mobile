import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../features/auth/AuthProvider';
import { useAvatar } from '../../features/avatar/avatars';
import { buildChatRows, daysBetween, type ChatRowItem } from '../../features/chat/chatFormat';
import { useChat } from '../../features/chat/ChatProvider';
import { timeAgo } from '../../i18n/activity';
import { useI18n } from '../../i18n/useI18n';
import { useServices } from '../../services/ServicesProvider';
import { MAX_CHAT_LENGTH, type ChatConversation, type ChatMessage } from '../../services/types';
import { AppText } from '../../ui/components/AppText';
import { Avatar } from '../../ui/components/Avatar';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { haptics } from '../../ui/haptics';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, radius, spacing, touchTarget } from '../../ui/theme';

type Status = 'loading' | 'ready' | 'notAllowed' | 'error' | 'disconnected';
const SUGGESTIONS = ['gg', 'rematch', 'strong', 'tomorrow'] as const;

/** Direct chat with a player you faced in a 1v1 (Nakama direct messages). */
export default function ChatScreen() {
  useScreenOrientation('portrait');
  const { m, f, n, dir, isRTL } = useI18n();
  const { userId, username: nameParam = '' } = useLocalSearchParams<{ userId: string; username?: string }>();
  const { social } = useServices();
  const { session } = useAuth();
  const { partners, setActive, notePreview } = useChat();
  const partner = partners?.find((p) => p.userId === userId);
  const username = partner?.username ?? nameParam;
  const avatar = useAvatar(social, userId, partner?.avatarAt);

  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const conversation = useRef<ChatConversation | null>(null);

  // Messages of this chat count as read while it is on screen.
  useFocusEffect(
    useCallback(() => {
      setActive(userId);
      return () => setActive(null);
    }, [setActive, userId]),
  );

  // Open the channel (again after a dropped connection).
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void)[] = [];
    (async () => {
      try {
        const c = await social.openChat(userId);
        if (cancelled) return c.close();
        conversation.current = c;
        setMessages(c.history);
        setHasOlder(c.history.length > 0);
        setStatus('ready');
        const newest = c.history[0];
        if (newest) notePreview(userId, { senderId: newest.senderId, text: newest.text, at: newest.at });
        unsubscribe = [
          c.subscribe((msg) => {
            setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [msg, ...prev]));
            notePreview(userId, { senderId: msg.senderId, text: msg.text, at: msg.at });
          }),
          c.onDisconnect(() => setStatus('disconnected')),
        ];
      } catch (e) {
        if (cancelled) return;
        setStatus(/1v1/.test(e instanceof Error ? e.message : '') ? 'notAllowed' : 'error');
      }
    })();
    return () => {
      cancelled = true;
      for (const u of unsubscribe) u();
      conversation.current?.close();
      conversation.current = null;
    };
  }, [social, userId, attempt, notePreview]);

  const retry = () => {
    setStatus('loading');
    setAttempt((a) => a + 1);
  };

  const send = async (raw: string) => {
    const body = raw.trim();
    if (!body || sending || !conversation.current) return;
    setSending(true);
    setSendError(false);
    try {
      await conversation.current.send(body);
      haptics.select();
      setText((current) => (current === raw ? '' : current));
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  };

  const loadOlder = async () => {
    if (!conversation.current || !hasOlder) return;
    const older = await conversation.current.loadOlder().catch(() => []);
    if (older.length === 0) setHasOlder(false);
    setMessages((prev) => [...prev, ...older.filter((o) => !prev.some((p) => p.id === o.id))]);
  };

  const myId = session?.userId;
  const rows = useMemo(() => buildChatRows(messages, myId), [messages, myId]);
  const time = useMemo(
    () => (at: number) => {
      const d = new Date(at);
      return n(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    },
    [n],
  );
  const rankLine = [
    partner?.rank && partner.rank in m.ranks ? m.ranks[partner.rank as keyof typeof m.ranks] : null,
    partner?.level ? f(m.vs.level, { level: partner.level }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const renderRow = ({ item }: { item: ChatRowItem }) => {
    if (item.kind === 'day') {
      return (
        <View style={styles.day} accessibilityRole="header">
          <AppText variant="caption" color={colors.textMuted}>
            {dayLabel(item.at, m.messages, n)}
          </AppText>
        </View>
      );
    }
    const { message, mine, groupStart, groupEnd } = item;
    return (
      <View
        style={[
          styles.bubble,
          mine ? styles.mine : styles.theirs,
          groupStart && styles.groupStart,
          !groupEnd && (mine ? styles.mineJoined : styles.theirsJoined),
        ]}
        accessible
        accessibilityLabel={`${mine ? m.common.you : message.username}: ${message.text}, ${time(message.at)}`}
      >
        <AppText color={mine ? colors.onAccent : colors.text} style={styles.messageText}>
          {message.text}
        </AppText>
        {groupEnd ? (
          <AppText variant="caption" color={mine ? colors.onAccentMuted : colors.textMuted} style={styles.time}>
            {time(message.at)}
          </AppText>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, dir]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={m.common.back}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Icon name={isRTL ? 'arrow-right' : 'arrow-left'} />
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/player/[userId]', params: { userId } })}
          accessibilityRole="button"
          accessibilityLabel={[username, rankLine].filter(Boolean).join(', ')}
          style={({ pressed }) => [styles.who, pressed && styles.pressed]}
        >
          <Avatar image={avatar} name={username} size={40} online={partner?.online} />
          <View style={styles.whoText}>
            <AppText variant="bodyBold" start numberOfLines={1} style={styles.ltr}>
              {username}
            </AppText>
            {partner ? (
              // Online status is text + color, never color alone.
              <AppText
                variant="caption"
                color={partner.online ? colors.accent : colors.textMuted}
                start
                numberOfLines={1}
              >
                {partner.online ? m.friends.online : m.friends.offline}
                {rankLine ? <AppText variant="caption" color={colors.textMuted}>{` · ${rankLine}`}</AppText> : null}
              </AppText>
            ) : null}
          </View>
          <Icon name={isRTL ? 'chevron-left' : 'chevron-right'} color={colors.textMuted} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {status === 'loading' ? (
          <ActivityIndicator color={colors.accent} style={styles.flex} />
        ) : status === 'notAllowed' || status === 'error' ? (
          <View style={styles.notice}>
            <Icon name="message-off-outline" size="xl" color={colors.textMuted} />
            <AppText center color={colors.textMuted}>
              {status === 'notAllowed' ? m.messages.notAllowed : m.messages.openError}
            </AppText>
            {status === 'error' ? (
              <Button label={m.messages.retry} variant="secondary" icon="refresh" onPress={retry} />
            ) : null}
          </View>
        ) : (
          <>
            {status === 'disconnected' ? (
              <View style={styles.banner} accessibilityRole="alert">
                <AppText variant="caption" style={styles.flex} start>
                  {m.messages.disconnected}
                </AppText>
                <Button label={m.messages.retry} variant="ghost" onPress={retry} />
              </View>
            ) : null}
            <FlatList
              inverted
              data={rows}
              keyExtractor={(x) => x.key}
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              onEndReached={loadOlder}
              onEndReachedThreshold={0.3}
              renderItem={renderRow}
              // Inverted: the footer is drawn at the top, above the oldest message.
              ListFooterComponent={
                messages.length > 0 && !hasOlder && partner?.lastPlayedAt ? (
                  <View style={styles.context}>
                    <Icon name="sword-cross" size="sm" color={colors.gold} />
                    <AppText variant="caption" color={colors.textMuted}>
                      {f(m.messages.playedTogether, { when: timeAgo(m, f, partner.lastPlayedAt) })}
                    </AppText>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={[styles.empty, styles.flipped]}>
                  <Avatar image={avatar} name={username} size={88} />
                  <AppText variant="heading" center style={styles.ltr}>
                    {username}
                  </AppText>
                  <AppText center color={colors.textMuted}>
                    {f(m.messages.empty, { username })}
                  </AppText>
                </View>
              }
            />

            {/* Quick replies: one tap after a match, while nothing is typed. */}
            {text.length === 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestions}
                keyboardShouldPersistTaps="handled"
              >
                {SUGGESTIONS.map((key) => (
                  <Pressable
                    key={key}
                    onPress={() => send(m.messages[key])}
                    disabled={status !== 'ready' || sending}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                  >
                    <AppText variant="label">{m.messages[key]}</AppText>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {sendError ? (
              <AppText variant="caption" color={colors.danger} center accessibilityRole="alert">
                {m.messages.sendError}
              </AppText>
            ) : null}
            <View style={styles.composer}>
              <TextInput
                value={text}
                onChangeText={(t) => {
                  setText(t);
                  setSendError(false);
                }}
                placeholder={m.messages.placeholder}
                placeholderTextColor={colors.textMuted}
                accessibilityLabel={m.messages.placeholder}
                maxLength={MAX_CHAT_LENGTH}
                multiline
                style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]}
              />
              <Pressable
                onPress={() => send(text)}
                disabled={!text.trim() || sending || status !== 'ready'}
                accessibilityRole="button"
                accessibilityLabel={m.messages.send}
                accessibilityState={{ disabled: !text.trim() || sending || status !== 'ready' }}
                style={({ pressed }) => [
                  styles.sendButton,
                  (!text.trim() || status !== 'ready') && styles.sendDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <View style={isRTL ? styles.flipIcon : undefined}>
                    <Icon name="send" color={colors.background} />
                  </View>
                )}
              </Pressable>
            </View>
            {text.length > MAX_CHAT_LENGTH - 50 ? (
              <AppText variant="caption" color={colors.textMuted} center>
                {f(m.messages.counter, { count: text.length, max: MAX_CHAT_LENGTH })}
              </AppText>
            ) : null}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "Today", "Yesterday" or the date of a day separator. */
function dayLabel(at: number, labels: { today: string; yesterday: string }, n: (v: string) => string): string {
  const days = daysBetween(at, Date.now());
  if (days <= 0) return labels.today;
  if (days === 1) return labels.yesterday;
  const d = new Date(at);
  return n(`${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.75,
  },
  who: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget,
  },
  whoText: {
    flex: 1,
  },
  ltr: {
    writingDirection: 'ltr',
  },
  notice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: '#5C4A1F',
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  day: {
    alignSelf: 'center',
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    marginVertical: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.goldDim,
  },
  // The list is inverted; its empty view is flipped back upright.
  flipped: {
    transform: [{ scaleY: -1 }],
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  bubble: {
    maxWidth: '80%',
    marginTop: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    gap: 2,
  },
  // A new group from the other side gets more room above it.
  groupStart: {
    marginTop: spacing.sm,
  },
  // The tail corner sits on the last bubble of a group; joined bubbles stay flat on that side.
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
    borderBottomEndRadius: radius.sm,
  },
  mineJoined: {
    borderTopEndRadius: radius.sm,
  },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceRaised,
    borderBottomStartRadius: radius.sm,
  },
  theirsJoined: {
    borderTopStartRadius: radius.sm,
  },
  messageText: {
    textAlign: 'auto',
  },
  time: {
    alignSelf: 'flex-end',
    fontSize: 11,
  },
  suggestions: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  suggestion: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    paddingTop: spacing.xs,
  },
  input: {
    flex: 1,
    minHeight: touchTarget,
    maxHeight: 120,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendDisabled: {
    backgroundColor: colors.surfaceRaised,
  },
  flipIcon: {
    transform: [{ scaleX: -1 }],
  },
});
