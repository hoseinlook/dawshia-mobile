import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { exerciseText, timeControlText } from '../../i18n/lookup';
import { useI18n } from '../../i18n/useI18n';
import { useServices } from '../../services/ServicesProvider';
import { AppText } from '../../ui/components/AppText';
import { Avatar } from '../../ui/components/Avatar';
import { Button } from '../../ui/components/Button';
import { colors, radius, spacing } from '../../ui/theme';
import { useAvatar } from '../avatar/avatars';
import { useFriends } from './FriendsProvider';
import { useChallenges } from './ChallengesProvider';

/** Card at the top of the tabs when a friend challenges you: accept or decline. */
export function IncomingChallenge() {
  const { m, f, dir } = useI18n();
  const { incoming, accept, decline } = useChallenges();
  const { friends } = useFriends();
  const { social } = useServices();
  const avatarAt = friends?.find((x) => x.userId === incoming?.userId)?.avatarAt;
  const avatar = useAvatar(social, incoming?.userId, avatarAt);
  if (!incoming) return null;

  return (
    <SafeAreaView edges={['top']} style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.card, dir]} accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <View style={styles.header}>
          <Avatar image={avatar} name={incoming.username} ringColor={colors.opponent} />
          <View style={styles.text}>
            <AppText variant="bodyBold" start>
              {f(m.challenge.incoming, { username: incoming.username })}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} start>
              {exerciseText(m, incoming.exerciseId).name} · {timeControlText(m, incoming.timeControlId).label}
            </AppText>
          </View>
        </View>
        <View style={styles.actions}>
          <Button
            label={m.challenge.decline}
            variant="secondary"
            onPress={() => decline(incoming)}
            style={styles.action}
          />
          <Button
            label={m.challenge.accept}
            icon="sword-cross"
            variant="versus"
            onPress={() => accept(incoming)}
            style={styles.action}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
  },
  card: {
    marginTop: spacing.sm,
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.opponent,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
