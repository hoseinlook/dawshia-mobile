import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideInRight, ZoomIn } from 'react-native-reanimated';

import type { Participant } from '../../../core/match/types';
import { useI18n } from '../../../i18n/useI18n';
import { useServices } from '../../../services/ServicesProvider';
import { Avatar } from '../../../ui/components/Avatar';
import { useAvatar, useMyAvatar } from '../../avatar/avatars';
import { AppText } from '../../../ui/components/AppText';
import { colors, fonts, radius, spacing } from '../../../ui/theme';

interface Props {
  you: Participant;
  opponent: Participant;
  exerciseName: string;
  onDismiss: () => void;
}

/**
 * Fighting-game "VS" moment when an online opponent is found: both names with
 * rank, level and rating. Tap anywhere to skip.
 */
export function VsIntro({ you, opponent, exerciseName, onDismiss }: Props) {
  const { m } = useI18n();
  return (
    <Animated.View style={styles.overlay} entering={FadeIn.duration(200)} exiting={FadeOut.duration(250)}>
      <Pressable
        style={styles.fill}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={`${you.displayName} ${m.online.vs} ${opponent.displayName}`}
      >
        <AppText variant="label" color={colors.textMuted} center>
          {exerciseName}
        </AppText>
        <View style={styles.row}>
          <Animated.View entering={SlideInLeft.springify().damping(16)} style={styles.side}>
            <PlayerPlate player={you} color={colors.accent} title={m.common.you} />
          </Animated.View>
          <Animated.View entering={ZoomIn.delay(250).springify()} style={styles.vsBadge}>
            <AppText style={styles.vs}>VS</AppText>
          </Animated.View>
          <Animated.View entering={SlideInRight.springify().damping(16)} style={styles.side}>
            <PlayerPlate player={opponent} color={colors.opponent} title={m.online.opponent} />
          </Animated.View>
        </View>
        <AppText variant="caption" color={colors.textMuted} center>
          {m.online.matchFound}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

function PlayerPlate({ player, color, title }: { player: Participant; color: string; title: string }) {
  const { m, f } = useI18n();
  const { social } = useServices();
  const mine = useMyAvatar();
  const theirs = useAvatar(social, player.isLocal ? undefined : player.id, player.profile?.avatarAt);
  const p = player.profile;
  const rank = p?.rank && p.rank in m.ranks ? m.ranks[p.rank as keyof typeof m.ranks] : null;
  return (
    <View style={[styles.plate, { borderColor: color }]}>
      <AppText variant="caption" color={color} center>
        {title}
      </AppText>
      <Avatar image={player.isLocal ? mine : theirs} name={player.displayName} size={72} ringColor={color} />
      <AppText variant="heading" center numberOfLines={1} style={styles.name}>
        {player.displayName}
      </AppText>
      {rank || p?.level ? (
        <AppText variant="label" color={colors.gold} center>
          {[rank, p?.level ? f(m.vs.level, { level: p.level }) : null].filter(Boolean).join(' · ')}
        </AppText>
      ) : null}
      {p?.rating ? (
        <AppText variant="caption" color={colors.textMuted} center>
          {f(m.vs.rating, { rating: Math.round(p.rating) })}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11,15,26,0.92)',
    zIndex: 10,
  },
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    direction: 'ltr', // you on the left, opponent on the right, as on the score bars
  },
  side: {
    flex: 1,
    maxWidth: 260,
  },
  plate: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    backgroundColor: colors.surface,
  },
  name: {
    writingDirection: 'ltr',
  },
  vsBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gold,
  },
  vs: {
    color: colors.onGold,
    fontFamily: fonts.display,
    fontSize: 36,
    lineHeight: 42,
  },
});
