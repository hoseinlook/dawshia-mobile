import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../features/auth/AuthProvider';
import { SignInRequired } from '../../features/auth/SignInRequired';
import { sortConversations } from '../../features/chat/chatFormat';
import { useChat } from '../../features/chat/ChatProvider';
import { ConversationRow } from '../../features/chat/ConversationRow';
import { useFriends } from '../../features/social/FriendsProvider';
import { formatScore, timeAgo } from '../../i18n/activity';
import { exerciseText } from '../../i18n/lookup';
import { showAlert } from '../../ui/alert';
import { useI18n } from '../../i18n/useI18n';
import { useServices } from '../../services/ServicesProvider';
import type { FriendInfo } from '../../services/types';
import { useAvatar } from '../../features/avatar/avatars';
import { AppText } from '../../ui/components/AppText';
import { Avatar } from '../../ui/components/Avatar';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, radius, spacing, touchTarget } from '../../ui/theme';

type Messages = ReturnType<typeof useI18n>['m'];
type Fill = ReturnType<typeof useI18n>['f'];
type Feedback = { kind: 'ok' | 'error'; text: string } | null;
type Tab = 'friends' | 'messages';

export default function FriendsScreen() {
  useScreenOrientation('portrait');
  const { m, dir } = useI18n();
  const { available, refresh } = useFriends();
  const chat = useChat();
  const refreshChats = chat.refresh;
  const [tab, setTab] = useState<Tab>('friends');
  const [refreshing, setRefreshing] = useState(false);

  // Fresh statuses whenever the tab is opened.
  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshChats();
    }, [refresh, refreshChats]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), refreshChats()]);
    setRefreshing(false);
  };

  if (!available) return <SignInRequired title={m.friends.offlineTitle} text={m.friends.offlineText} />;

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />;
  const header = (
    <View style={styles.header}>
      <AppText variant="title" start>
        {tab === 'friends' ? m.friends.title : m.messages.title}
      </AppText>
      <Tabs tab={tab} onChange={setTab} unread={chat.totalUnread} />
    </View>
  );

  return (
    <SafeAreaView style={[styles.root, dir]} edges={['top']}>
      {tab === 'friends' ? (
        <FriendsList header={header} refreshControl={refreshControl} onRetry={onRefresh} />
      ) : (
        <Inbox header={header} refreshControl={refreshControl} />
      )}
    </SafeAreaView>
  );
}

/** Friends / Messages switch at the top of the tab; Messages shows its unread count. */
function Tabs({ tab, onChange, unread }: { tab: Tab; onChange: (tab: Tab) => void; unread: number }) {
  const { m, f, n } = useI18n();
  const items: { id: Tab; label: string; icon: React.ComponentProps<typeof Icon>['name'] }[] = [
    { id: 'friends', label: m.messages.tabFriends, icon: 'account-group' },
    { id: 'messages', label: m.messages.tabMessages, icon: 'message-text' },
  ];
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {items.map((item) => {
        const selected = item.id === tab;
        const badge = item.id === 'messages' && unread > 0;
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={badge ? f(m.messages.tabUnread, { n: unread }) : item.label}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.tabSelected,
              pressed && !selected && styles.tabPressed,
            ]}
          >
            <Icon name={item.icon} size="sm" color={selected ? colors.onAccent : colors.textMuted} />
            <AppText variant="label" color={selected ? colors.onAccent : colors.textMuted}>
              {item.label}
            </AppText>
            {badge ? (
              <View style={[styles.tabBadge, selected && styles.tabBadgeSelected]}>
                <AppText variant="caption" color={selected ? colors.accent : colors.onAccent}>
                  {n(unread > 99 ? '99+' : unread)}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function FriendsList({
  header,
  refreshControl,
  onRetry,
}: {
  header: React.ReactNode;
  refreshControl: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  onRetry: () => void;
}) {
  const { m } = useI18n();
  const { friends, error } = useFriends();

  const incoming = friends?.filter((x) => x.state === 'incoming') ?? [];
  const outgoing = friends?.filter((x) => x.state === 'outgoing') ?? [];
  // Online friends first, then the most recently active.
  const mutual = (friends?.filter((x) => x.state === 'friend') ?? []).sort(
    (a, b) => Number(b.online) - Number(a.online) || (b.lastActivity?.at ?? 0) - (a.lastActivity?.at ?? 0),
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {header}
      <AddFriend />

      {friends === null && !error ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : null}
      {error && friends === null ? (
        <View style={styles.notice}>
          <AppText color={colors.textMuted} start>
            {m.friends.loadError}
          </AppText>
          <Button label={m.profile.retry} variant="secondary" icon="refresh" onPress={onRetry} />
        </View>
      ) : null}

      {incoming.length > 0 ? (
        <Section title={m.friends.requests} count={incoming.length}>
          {incoming.map((x) => (
            <FriendRow key={x.userId} friend={x} />
          ))}
        </Section>
      ) : null}

      {friends !== null ? (
        <Section title={m.friends.list} count={mutual.length}>
          {mutual.length === 0 && outgoing.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="account-group-outline" size="xl" color={colors.textMuted} />
              <AppText variant="bodyBold">{m.friends.emptyTitle}</AppText>
              <AppText variant="caption" color={colors.textMuted} style={styles.center}>
                {m.friends.emptyText}
              </AppText>
            </View>
          ) : null}
          {mutual.map((x) => (
            <FriendRow key={x.userId} friend={x} />
          ))}
          {outgoing.map((x) => (
            <FriendRow key={x.userId} friend={x} />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

/** Conversations with current and past 1v1 opponents, unread and newest first. */
function Inbox({
  header,
  refreshControl,
}: {
  header: React.ReactNode;
  refreshControl: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
}) {
  const { m } = useI18n();
  const { session } = useAuth();
  const { partners, unread } = useChat();
  const conversations = partners ? sortConversations(partners, unread) : null;

  return (
    <FlatList
      data={conversations ?? []}
      keyExtractor={(p) => p.userId}
      renderItem={({ item }) => (
        <ConversationRow partner={item} unread={unread[item.userId] ?? 0} myId={session?.userId} />
      )}
      contentContainerStyle={styles.content}
      refreshControl={refreshControl}
      ListHeaderComponent={
        <View style={styles.inboxHeader}>
          {header}
          {conversations && conversations.length > 0 ? (
            <AppText variant="caption" color={colors.textMuted} start>
              {m.messages.hint}
            </AppText>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        conversations === null ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="message-text-outline" size="lg" color={colors.accent} />
            </View>
            <AppText variant="bodyBold">{m.messages.inboxEmptyTitle}</AppText>
            <AppText variant="caption" color={colors.textMuted} style={styles.center}>
              {m.messages.inboxEmptyText}
            </AppText>
            <Button label={m.messages.playOneVsOne} icon="sword-cross" onPress={() => router.navigate('/')} />
          </View>
        )
      }
    />
  );
}

function AddFriend() {
  const { m, f, textStart } = useI18n();
  const { add } = useFriends();
  const { session } = useAuth();
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const submit = async () => {
    const name = username.trim();
    if (!name || busy) return;
    if (name.toLowerCase() === session?.username.toLowerCase()) {
      setFeedback({ kind: 'error', text: m.friends.cannotAddSelf });
      return;
    }
    setBusy(true);
    try {
      await add(name);
      setFeedback({
        kind: 'ok',
        text: f(m.friends.requestSent, { username: name }),
      });
      setUsername('');
    } catch {
      setFeedback({ kind: 'error', text: m.friends.notFound });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <AppText variant="bodyBold" style={textStart} nativeID="addFriendLabel">
        {m.friends.addLabel}
      </AppText>
      <View style={styles.addRow}>
        <TextInput
          value={username}
          onChangeText={(t) => {
            setUsername(t);
            setFeedback(null);
          }}
          onSubmitEditing={submit}
          placeholder={m.friends.addPlaceholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          accessibilityLabel={m.friends.addLabel}
          accessibilityLabelledBy="addFriendLabel"
          style={styles.input}
        />
        <Button label={m.friends.add} icon="account-plus" onPress={submit} disabled={busy || !username.trim()} />
      </View>
      {feedback ? (
        <AppText
          variant="caption"
          color={feedback.kind === 'ok' ? colors.accent : colors.danger}
          style={textStart}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {feedback.text}
        </AppText>
      ) : null}
    </View>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const { n } = useI18n();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <AppText variant="heading" start>
          {title}
        </AppText>
        {count > 0 ? (
          <View style={styles.countPill}>
            <AppText variant="caption">{n(count)}</AppText>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function FriendRow({ friend }: { friend: FriendInfo }) {
  const { m, f } = useI18n();
  const { add, remove } = useFriends();
  const { social } = useServices();
  const avatar = useAvatar(social, friend.userId, friend.avatarAt);
  const [busy, setBusy] = useState(false);

  const run = (action: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await action();
    } catch {
      showAlert(m.friends.loadError);
    } finally {
      setBusy(false);
    }
  };
  const confirmRemove = () =>
    showAlert(m.friends.remove, f(m.friends.removeConfirm, { username: friend.username }), [
      { text: m.session.stay, style: 'cancel' },
      {
        text: m.friends.remove,
        style: 'destructive',
        onPress: run(() => remove(friend.userId)),
      },
    ]);

  const isFriend = friend.state === 'friend';
  const status = isFriend ? (friend.online ? m.friends.online : m.friends.offline) : null;
  const rankLine = [
    friend.rank && friend.rank in m.ranks ? m.ranks[friend.rank as keyof Messages['ranks']] : null,
    friend.level ? f(m.vs.level, { level: friend.level }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.row} accessible={false}>
      <Pressable
        onPress={() =>
          router.push({
            pathname: '/player/[userId]',
            params: { userId: friend.userId },
          })
        }
        accessibilityRole="button"
        accessibilityLabel={[friend.username, status, rankLine].filter(Boolean).join(', ')}
        style={({ pressed }) => [styles.openPlayer, pressed && styles.iconButtonPressed]}
      >
        <Avatar image={avatar} name={friend.username} online={isFriend ? friend.online : undefined} />
        <View style={styles.rowText}>
          <AppText variant="bodyBold" start numberOfLines={1} style={styles.username}>
            {friend.username}
          </AppText>
          {status ? (
            // Online status is text + color, never color alone.
            <AppText variant="caption" color={friend.online ? colors.accent : colors.textMuted} start>
              {status}
              {rankLine ? ` · ${rankLine}` : ''}
            </AppText>
          ) : (
            <AppText variant="caption" color={colors.textMuted} start>
              {friend.state === 'outgoing' ? m.friends.pending : rankLine}
            </AppText>
          )}
          {isFriend ? (
            <AppText variant="caption" color={colors.textMuted} start numberOfLines={2}>
              {friend.lastActivity ? lastPracticeText(m, f, friend.lastActivity) : m.friends.noActivity}
            </AppText>
          ) : null}
        </View>
      </Pressable>

      {busy ? (
        <ActivityIndicator color={colors.accent} style={styles.iconButton} />
      ) : friend.state === 'incoming' ? (
        <View style={styles.actions}>
          <IconButton
            icon="check"
            label={m.friends.accept}
            color={colors.accent}
            onPress={run(() => add(friend.username))}
          />
          <IconButton
            icon="close"
            label={m.friends.decline}
            color={colors.danger}
            onPress={run(() => remove(friend.userId))}
          />
        </View>
      ) : friend.state === 'outgoing' ? (
        <IconButton
          icon="close"
          label={m.friends.cancelRequest}
          color={colors.textMuted}
          onPress={run(() => remove(friend.userId))}
        />
      ) : (
        <View style={styles.actions}>
          {friend.online ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/challenge/[userId]',
                  params: { userId: friend.userId, username: friend.username },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={f(m.challenge.fightLabel, { username: friend.username })}
              style={({ pressed }) => [styles.fight, pressed && styles.fightPressed]}
            >
              <Icon name="sword-cross" size="sm" color={colors.background} />
              <AppText variant="label" color={colors.background}>
                {m.challenge.fight}
              </AppText>
            </Pressable>
          ) : null}
          <IconButton
            icon="account-remove-outline"
            label={m.friends.remove}
            color={colors.textMuted}
            onPress={confirmRemove}
          />
        </View>
      )}
    </View>
  );
}

function IconButton({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
    >
      <Icon name={icon} color={color} />
    </Pressable>
  );
}

function lastPracticeText(m: Messages, f: Fill, a: NonNullable<FriendInfo['lastActivity']>): string {
  const score = formatScore(m, f, a.timeControl, a.score);
  return f(m.friends.lastPractice, {
    exercise: exerciseText(m, a.exercise).name,
    score,
    when: timeAgo(m, f, a.at),
  });
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  header: {
    gap: spacing.md,
  },
  inboxHeader: {
    gap: spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
    padding: spacing.xs,
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touchTarget,
    borderRadius: radius.pill,
  },
  tabSelected: {
    backgroundColor: colors.accent,
  },
  tabPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  tabBadgeSelected: {
    backgroundColor: colors.onAccent,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentDim,
  },
  center: {
    textAlign: 'center',
  },
  loading: {
    marginVertical: spacing.xl,
  },
  notice: {
    gap: spacing.sm,
  },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  addRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: touchTarget,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    // Usernames are Latin text.
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  countPill: {
    minWidth: 24,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  openPlayer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  username: {
    writingDirection: 'ltr',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.opponent,
  },
  fightPressed: {
    opacity: 0.8,
  },
  iconButtonPressed: {
    backgroundColor: colors.surfaceRaised,
  },
});
