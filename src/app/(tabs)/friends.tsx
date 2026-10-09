import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../features/auth/AuthProvider';
import { useFriends } from '../../features/social/FriendsProvider';
import { exerciseText } from '../../i18n/lookup';
import { useI18n } from '../../i18n/useI18n';
import type { FriendInfo } from '../../services/types';
import { getTimeControl } from '../../core/match/timeControls';
import { AppText } from '../../ui/components/AppText';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, radius, spacing, touchTarget } from '../../ui/theme';

type Messages = ReturnType<typeof useI18n>['m'];
type Feedback = { kind: 'ok' | 'error'; text: string } | null;

export default function FriendsScreen() {
  useScreenOrientation('portrait');
  const { m, dir } = useI18n();
  const { available, friends, error, refresh } = useFriends();
  const [refreshing, setRefreshing] = useState(false);

  // Fresh statuses whenever the tab is opened.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  if (!available) return <SignedOut />;

  const incoming = friends?.filter((x) => x.state === 'incoming') ?? [];
  const outgoing = friends?.filter((x) => x.state === 'outgoing') ?? [];
  // Online friends first, then the most recently active.
  const mutual = (friends?.filter((x) => x.state === 'friend') ?? []).sort(
    (a, b) => Number(b.online) - Number(a.online) || (b.lastActivity?.at ?? 0) - (a.lastActivity?.at ?? 0),
  );

  return (
    <SafeAreaView style={[styles.root, dir]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        <AppText variant="title" start>
          {m.friends.title}
        </AppText>

        <AddFriend />

        {friends === null && !error ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : null}
        {error && friends === null ? (
          <View style={styles.notice}>
            <AppText color={colors.textMuted} start>
              {m.friends.loadError}
            </AppText>
            <Button label={m.profile.retry} variant="secondary" icon="refresh" onPress={onRefresh} />
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
    </SafeAreaView>
  );
}

function SignedOut() {
  const { m, dir } = useI18n();
  const { signOut } = useAuth();
  return (
    <SafeAreaView style={[styles.root, dir]} edges={['top']}>
      <View style={[styles.content, styles.signedOut]}>
        <Icon name="account-lock-outline" size="xl" color={colors.textMuted} />
        <AppText variant="heading">{m.friends.offlineTitle}</AppText>
        <AppText color={colors.textMuted} style={styles.center}>
          {m.friends.offlineText}
        </AppText>
        {/* Leaving offline mode returns to the sign-in screen. */}
        <Button label={m.friends.signIn} icon="login" onPress={signOut} />
      </View>
    </SafeAreaView>
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
      setFeedback({ kind: 'ok', text: f(m.friends.requestSent, { username: name }) });
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
  const [busy, setBusy] = useState(false);

  const run = (action: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await action();
    } catch {
      Alert.alert(m.friends.loadError);
    } finally {
      setBusy(false);
    }
  };
  const confirmRemove = () =>
    Alert.alert(m.friends.remove, f(m.friends.removeConfirm, { username: friend.username }), [
      { text: m.session.stay, style: 'cancel' },
      { text: m.friends.remove, style: 'destructive', onPress: run(() => remove(friend.userId)) },
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
      <View style={styles.avatar}>
        <AppText variant="heading" color={colors.text}>
          {friend.username.slice(0, 1).toUpperCase()}
        </AppText>
        {isFriend ? (
          <View
            style={[styles.dot, { backgroundColor: friend.online ? colors.accent : colors.textMuted }]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
      </View>

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

      {busy ? (
        <ActivityIndicator color={colors.accent} style={styles.iconButton} />
      ) : friend.state === 'incoming' ? (
        <View style={styles.actions}>
          <IconButton icon="check" label={m.friends.accept} color={colors.accent} onPress={run(() => add(friend.username))} />
          <IconButton icon="close" label={m.friends.decline} color={colors.danger} onPress={run(() => remove(friend.userId))} />
        </View>
      ) : friend.state === 'outgoing' ? (
        <IconButton icon="close" label={m.friends.cancelRequest} color={colors.textMuted} onPress={run(() => remove(friend.userId))} />
      ) : (
        <IconButton icon="account-remove-outline" label={m.friends.remove} color={colors.textMuted} onPress={confirmRemove} />
      )}
    </View>
  );
}

function IconButton({ icon, label, color, onPress }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; color: string; onPress: () => void }) {
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

function lastPracticeText(
  m: Messages,
  f: (t: string, p?: Record<string, string | number>) => string,
  a: NonNullable<FriendInfo['lastActivity']>,
): string {
  const format = getTimeControl(a.timeControl).format;
  const score =
    format === 'maxHold'
      ? f(m.game.seconds, { seconds: a.score })
      : format === 'game'
        ? f(m.game.pipes, { count: a.score })
        : f(m.friends.repsScore, { count: a.score });
  return f(m.friends.lastPractice, { exercise: exerciseText(m, a.exercise).name, score, when: timeAgo(m, f, a.at) });
}

function timeAgo(m: Messages, f: (t: string, p?: Record<string, string | number>) => string, at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return m.friends.justNow;
  if (minutes < 60) return f(m.friends.minutesAgo, { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return f(m.friends.hoursAgo, { n: hours });
  return f(m.friends.daysAgo, { n: Math.floor(hours / 24) });
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
  signedOut: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  dot: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.surface,
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
  iconButtonPressed: {
    backgroundColor: colors.surfaceRaised,
  },
});
