import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getExercise, listExercises } from '../../core/exercises/registry';
import { isGame, isHold } from '../../core/match/timeControls';
import { computeProgress } from '../../core/progress/progress';
import { useAvatar, useMyAvatar } from '../../features/avatar/avatars';
import { useAuth } from '../../features/auth/AuthProvider';
import { useHistory } from '../../features/progress/useHistory';
import { useFriends } from '../../features/social/FriendsProvider';
import { formatScore, levelGap, timeAgo } from '../../i18n/activity';
import { exerciseText, timeControlText } from '../../i18n/lookup';
import { useI18n } from '../../i18n/useI18n';
import { useServices } from '../../services/ServicesProvider';
import type { Activity, PlayerDetails } from '../../services/types';
import { AppText } from '../../ui/components/AppText';
import { Avatar } from '../../ui/components/Avatar';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { ProgressBar } from '../../ui/components/ProgressBar';
import { exerciseIcon } from '../../ui/exerciseIcons';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, fonts, radius, spacing, touchTarget } from '../../ui/theme';

type Messages = ReturnType<typeof useI18n>['m'];
type Fill = ReturnType<typeof useI18n>['f'];

/** Another player's page: level compared with yours, and a summary + history per movement. */
export default function PlayerScreen() {
  useScreenOrientation('portrait');
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { m, f, n, dir, isRTL } = useI18n();
  const { social } = useServices();
  const [player, setPlayer] = useState<PlayerDetails | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlayer(await social.getPlayer(userId));
      setError(false);
    } catch {
      setError(true);
    }
  }, [social, userId]);
  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const avatar = useAvatar(social, player?.userId, player?.avatarAt);

  return (
    <SafeAreaView style={[styles.root, dir]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={m.common.back}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <Icon name={isRTL ? 'arrow-right' : 'arrow-left'} />
        </Pressable>

        {player === null ? (
          error ? (
            <View style={styles.notice}>
              <AppText color={colors.textMuted} center>
                {m.player.loadError}
              </AppText>
              <Button label={m.profile.retry} variant="secondary" icon="refresh" onPress={load} />
            </View>
          ) : (
            <ActivityIndicator color={colors.accent} style={styles.loading} />
          )
        ) : (
          <>
            <View style={styles.hero}>
              <Avatar image={avatar} name={player.username} size={104} ringColor={colors.gold} />
              <AppText variant="title" center style={styles.username}>
                {player.username}
              </AppText>
              <AppText variant="label" color={colors.gold} center>
                {rankTitle(m, player.rank)} · {f(m.vs.level, { level: player.level })}
                {player.position ? ` · ${n(`#${player.position}`)}` : ''}
              </AppText>
              <View style={styles.statusRow}>
                <View style={[styles.dot, { backgroundColor: player.online ? colors.accent : colors.textMuted }]} />
                <AppText variant="caption" color={player.online ? colors.accent : colors.textMuted}>
                  {player.online ? m.player.online : m.player.offline}
                </AppText>
              </View>
              <FriendAction player={player} />
            </View>

            <Compare player={player} avatar={avatar} />

            <AppText variant="heading" start style={styles.section}>
              {m.player.movements}
            </AppText>
            <Movements player={player} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FriendAction({ player }: { player: PlayerDetails }) {
  const { m } = useI18n();
  const { session } = useAuth();
  const { friends, add } = useFriends();
  const [busy, setBusy] = useState(false);
  if (player.userId === session?.userId || friends === null) return null;
  const state = friends.find((x) => x.userId === player.userId)?.state;

  if (state === 'friend') {
    return <Chip icon="account-check" label={m.player.isFriend} color={colors.accent} />;
  }
  if (state === 'outgoing') {
    return <Chip icon="clock-outline" label={m.player.requestSent} color={colors.textMuted} />;
  }
  const onPress = async () => {
    setBusy(true);
    try {
      await add(player.username);
    } catch {
      // The friends list shows the real state after the next refresh.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      label={state === 'incoming' ? m.player.acceptRequest : m.player.addFriend}
      icon="account-plus"
      variant="secondary"
      disabled={busy}
      onPress={onPress}
    />
  );
}

/** Your level next to theirs (relatedness + social comparison). */
function Compare({ player, avatar }: { player: PlayerDetails; avatar: string | null }) {
  const { m, f, n } = useI18n();
  const { session } = useAuth();
  const history = useHistory();
  const myAvatar = useMyAvatar();
  const mine = useMemo(() => (history ? computeProgress(history, new Date()) : null), [history]);
  if (!mine || player.userId === session?.userId) return null;
  const maxXp = Math.max(1, mine.totalXp, player.xp);

  return (
    <View style={styles.card}>
      <AppText variant="bodyBold" start>
        {f(m.player.compareTitle, { username: player.username })}
      </AppText>
      <CompareRow
        avatar={<Avatar image={myAvatar} name={session?.username ?? m.common.you} size={36} ringColor={colors.accent} />}
        label={m.common.you}
        level={n(mine.level.level)}
        value={mine.totalXp / maxXp}
        color={colors.accent}
      />
      <CompareRow
        avatar={<Avatar image={avatar} name={player.username} size={36} ringColor={colors.opponent} />}
        label={player.username}
        level={n(player.level)}
        value={player.xp / maxXp}
        color={colors.opponent}
      />
      <AppText variant="label" color={colors.gold} center>
        {levelGap(m, f, player.level, mine.level.level)}
      </AppText>
    </View>
  );
}

function CompareRow(props: { avatar: React.ReactNode; label: string; level: string; value: number; color: string }) {
  return (
    <View style={styles.compareRow}>
      {props.avatar}
      <View style={styles.compareBar}>
        <AppText variant="caption" start numberOfLines={1}>
          {props.label}
        </AppText>
        <ProgressBar value={Math.min(1, props.value)} color={props.color} height={8} />
      </View>
      <AppText style={[styles.compareLevel, { color: props.color }]}>{props.level}</AppText>
    </View>
  );
}

function Movements({ player }: { player: PlayerDetails }) {
  const { m } = useI18n();
  // Movements they trained, most trained first.
  const items = listExercises()
    .map((e) => ({
      exercise: e.id,
      totals: player.exercises.find((x) => x.exercise === e.id) ?? { today: 0, month: 0, total: 0 },
      history: player.history.filter((a) => a.exercise === e.id),
    }))
    .filter((x) => x.totals.total > 0 || x.history.length > 0)
    .sort((a, b) => b.history.length - a.history.length || b.totals.total - a.totals.total);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Icon name="dumbbell" size="xl" color={colors.textMuted} />
        <AppText color={colors.textMuted} center>
          {m.player.noMovements}
        </AppText>
      </View>
    );
  }
  return (
    <>
      {items.map((x) => (
        <MovementCard key={x.exercise} exerciseId={x.exercise} totals={x.totals} history={x.history} ratings={player.ratings} />
      ))}
    </>
  );
}

interface MovementProps {
  exerciseId: string;
  totals: { today: number; month: number; total: number };
  history: Activity[];
  ratings: PlayerDetails['ratings'];
}

function MovementCard({ exerciseId, totals, history, ratings }: MovementProps) {
  const { m, f, n } = useI18n();
  const [open, setOpen] = useState(false);
  const exercise = getExercise(exerciseId);
  const game = !!exercise?.competitions.every(isGame);
  const tint = game ? colors.game : colors.accent;
  const unit = game ? m.profile.pipes : exercise?.competitions.every(isHold) ? m.profile.seconds : m.profile.reps;
  const best = history.reduce((max, a) => Math.max(max, a.score), 0);
  const competitionRatings = (exercise?.competitions ?? []).flatMap((tc) => {
    const r = ratings[`${exerciseId}.${tc}`];
    return r ? [{ tc, ...r }] : [];
  });
  const wins = history.filter((a) => a.outcome === 'win').length;
  const losses = history.filter((a) => a.outcome === 'loss').length;

  return (
    <View style={styles.card}>
      <View style={styles.cardTitle}>
        <Icon name={exerciseIcon(exerciseId)} color={tint} />
        <AppText variant="heading" start style={styles.flex}>
          {exerciseText(m, exerciseId).name}
        </AppText>
        {wins + losses > 0 ? (
          <AppText variant="label" color={colors.textMuted}>
            {n(wins)} {m.player.win} · {n(losses)} {m.player.loss}
          </AppText>
        ) : null}
      </View>

      <View style={styles.statsRow}>
        <Stat label={m.player.today} value={n(totals.today)} unit={unit} />
        <Stat label={m.player.month} value={n(totals.month)} unit={unit} />
        <Stat label={m.player.total} value={n(totals.total)} unit={unit} />
      </View>
      <View style={styles.statsRow}>
        <Stat label={m.player.sessions} value={n(history.length)} />
        <Stat label={m.player.best} value={best > 0 ? n(best) : '–'} unit={best > 0 ? unit : undefined} highlight />
        <Stat
          label={m.player.rating}
          value={competitionRatings.length ? n(Math.max(...competitionRatings.map((r) => r.rating))) : '–'}
        />
      </View>

      {history.length > 0 ? (
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [styles.toggle, pressed && styles.backPressed]}
        >
          <AppText variant="label" color={tint}>
            {open ? m.player.hideHistory : m.player.showHistory}
          </AppText>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} color={tint} size="sm" />
        </Pressable>
      ) : null}
      {open ? history.map((a, i) => <HistoryRow key={`${a.at}-${i}`} activity={a} m={m} f={f} />) : null}
    </View>
  );
}

function HistoryRow({ activity: a, m, f }: { activity: Activity; m: Messages; f: Fill }) {
  const mode = a.mode === 'ranked' ? m.player.ranked : a.mode === 'friendly' ? m.player.friendly : m.player.practice;
  const outcome = a.outcome ? { win: m.player.win, loss: m.player.loss, draw: m.player.draw }[a.outcome] : null;
  const outcomeColor = a.outcome === 'win' ? colors.accent : a.outcome === 'loss' ? colors.opponent : colors.textMuted;
  return (
    <View style={styles.historyRow}>
      <View style={styles.flex}>
        <AppText variant="label" start>
          {timeControlText(m, a.timeControl).label} · {mode}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} start>
          {timeAgo(m, f, a.at)}
        </AppText>
      </View>
      {outcome ? <Chip label={outcome} color={outcomeColor} /> : null}
      <AppText variant="bodyBold">{formatScore(m, f, a.timeControl, a.score)}</AppText>
    </View>
  );
}

function Stat({ label, value, unit, highlight }: { label: string; value: string; unit?: string; highlight?: boolean }) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText style={[styles.statValue, highlight && { color: colors.gold }]}>{value}</AppText>
      {unit ? (
        <AppText variant="caption" color={colors.textMuted}>
          {unit}
        </AppText>
      ) : null}
    </View>
  );
}

function Chip({ label, color, icon }: { label: string; color: string; icon?: React.ComponentProps<typeof Icon>['name'] }) {
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      {icon ? <Icon name={icon} size="sm" color={color} /> : null}
      <AppText variant="caption" color={color}>
        {label}
      </AppText>
    </View>
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
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  back: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  backPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  loading: {
    marginVertical: spacing.xl,
  },
  notice: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  username: {
    writingDirection: 'ltr',
    marginTop: spacing.sm,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  section: {
    marginTop: spacing.sm,
  },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  statValue: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 32,
    fontVariant: ['tabular-nums'],
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compareBar: {
    flex: 1,
    gap: 4,
  },
  compareLevel: {
    minWidth: 40,
    textAlign: 'center',
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 32,
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
  toggle: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
