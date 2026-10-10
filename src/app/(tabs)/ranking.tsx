import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../features/auth/AuthProvider';
import { SignInRequired } from '../../features/auth/SignInRequired';
import { useAvatar, useMyAvatar } from '../../features/avatar/avatars';
import { levelGap } from '../../i18n/activity';
import { useI18n } from '../../i18n/useI18n';
import { useServices } from '../../services/ServicesProvider';
import type { RankedPlayer } from '../../services/types';
import { AppText } from '../../ui/components/AppText';
import { Avatar } from '../../ui/components/Avatar';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, fonts, radius, spacing } from '../../ui/theme';

type Messages = ReturnType<typeof useI18n>['m'];

/** Gold, silver and bronze for the podium. */
const MEDALS = ['#FFC145', '#C9D1E0', '#D9895B'];

interface Board {
  players: RankedPlayer[];
  me: RankedPlayer | null;
}

export default function RankingScreen() {
  useScreenOrientation('portrait');
  const { m, f, dir } = useI18n();
  const { social } = useServices();
  const { session } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!social.available) return;
    try {
      setBoard(await social.listTopPlayers());
      setError(false);
    } catch {
      setError(true);
    }
  }, [social]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!social.available) return <SignInRequired title={m.ranking.offlineTitle} text={m.ranking.offlineText} />;

  const me = board?.me ?? null;
  const topXp = Math.max(1, board?.players[0]?.xp ?? 1);
  const open = (p: RankedPlayer) =>
    p.userId === session?.userId
      ? router.navigate('/profile')
      : router.push({ pathname: '/player/[userId]', params: { userId: p.userId } });

  return (
    <SafeAreaView style={[styles.root, dir]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        <View style={styles.header}>
          <AppText variant="title" start>
            {m.ranking.title}
          </AppText>
          <AppText variant="caption" color={colors.textMuted} start>
            {m.ranking.subtitle}
          </AppText>
        </View>

        {me ? <MyPosition me={me} /> : null}

        {board === null && !error ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : null}
        {error && board === null ? (
          <View style={styles.notice}>
            <AppText color={colors.textMuted} start>
              {m.ranking.loadError}
            </AppText>
            <Button label={m.profile.retry} variant="secondary" icon="refresh" onPress={onRefresh} />
          </View>
        ) : null}
        {board && board.players.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="trophy-outline" size="xl" color={colors.textMuted} />
            <AppText color={colors.textMuted} center>
              {m.ranking.empty}
            </AppText>
          </View>
        ) : null}

        {board?.players.map((p) => (
          <PlayerRow
            key={p.userId}
            player={p}
            isMe={p.userId === session?.userId}
            myLevel={me?.level ?? null}
            topXp={topXp}
            onPress={() => open(p)}
            m={m}
            f={f}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function MyPosition({ me }: { me: RankedPlayer }) {
  const { m, f, n } = useI18n();
  const myAvatar = useMyAvatar();
  return (
    <View style={styles.meCard}>
      <Avatar image={myAvatar} name={me.username} size={56} ringColor={colors.accent} />
      <View style={styles.rowText}>
        <AppText variant="bodyBold" start numberOfLines={1}>
          {me.username}
        </AppText>
        <AppText variant="caption" color={colors.gold} start>
          {rankTitle(m, me.rank)} · {f(m.vs.level, { level: me.level })}
        </AppText>
      </View>
      <View style={styles.mePosition}>
        <AppText variant="caption" color={colors.textMuted}>
          {m.ranking.you}
        </AppText>
        <AppText style={styles.positionBig}>{me.position ? n(`#${me.position}`) : '–'}</AppText>
      </View>
    </View>
  );
}

interface RowProps {
  player: RankedPlayer;
  isMe: boolean;
  myLevel: number | null;
  topXp: number;
  onPress: () => void;
  m: Messages;
  f: ReturnType<typeof useI18n>['f'];
}

function PlayerRow({ player, isMe, myLevel, topXp, onPress, m, f }: RowProps) {
  const { n } = useI18n();
  const { social } = useServices();
  const theirAvatar = useAvatar(social, isMe ? undefined : player.userId, player.avatarAt);
  const myAvatar = useMyAvatar();
  const position = player.position ?? 0;
  const medal = position >= 1 && position <= 3 ? MEDALS[position - 1] : null;
  const gap = isMe ? m.ranking.you : myLevel !== null ? levelGap(m, f, player.level, myLevel) : '';
  const rank = rankTitle(m, player.rank);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[f(m.ranking.position, { position }), player.username, rank, f(m.vs.level, { level: player.level }), gap]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [styles.row, isMe && styles.rowMe, pressed && styles.pressed]}
    >
      <View style={styles.position}>
        {medal ? (
          <Icon name="medal" color={medal} size="lg" />
        ) : (
          <AppText variant="bodyBold" color={colors.textMuted}>
            {n(position)}
          </AppText>
        )}
      </View>
      <Avatar
        image={isMe ? myAvatar : theirAvatar}
        name={player.username}
        ringColor={medal ?? (isMe ? colors.accent : undefined)}
        online={player.online}
      />
      <View style={styles.rowText}>
        <AppText variant="bodyBold" start numberOfLines={1} style={styles.username}>
          {player.username}
        </AppText>
        <AppText variant="caption" color={colors.gold} start numberOfLines={1}>
          {rank} · {f(m.vs.level, { level: player.level })}
        </AppText>
        {/* Level comparison: XP relative to the top player, and the gap to you. */}
        <ProgressBar value={Math.min(1, player.xp / topXp)} color={isMe ? colors.accent : colors.gold} height={6} />
        <AppText variant="caption" color={isMe ? colors.accent : colors.textMuted} start>
          {gap}
        </AppText>
      </View>
      <View style={styles.levelBadge}>
        <AppText style={styles.levelNumber}>{n(player.level)}</AppText>
      </View>
    </Pressable>
  );
}

function rankTitle(m: Messages, rank: string): string {
  return rank in m.ranks ? m.ranks[rank as keyof Messages['ranks']] : rank;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  header: {
    gap: 2,
    marginBottom: spacing.sm,
  },
  loading: {
    marginVertical: spacing.xl,
  },
  notice: {
    gap: spacing.sm,
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
  meCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentDim,
    backgroundColor: colors.surface,
  },
  mePosition: {
    alignItems: 'center',
  },
  positionBig: {
    color: colors.accent,
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowMe: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.75,
  },
  position: {
    width: 36,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  username: {
    writingDirection: 'ltr',
  },
  levelBadge: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.goldDim,
  },
  levelNumber: {
    color: colors.gold,
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 28,
  },
});
