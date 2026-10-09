import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

import type { ExerciseDefinition } from '../../core/exercises/types';
import { remainingMs } from '../../core/match/matchReducer';
import { isHold, type TimeControlId } from '../../core/match/timeControls';
import type { MatchMode } from '../../core/match/types';
import { personalBest } from '../../core/progress/progress';
import { cueText, exerciseText } from '../../i18n/lookup';
import { useI18n } from '../../i18n/useI18n';
import { AppText } from '../../ui/components/AppText';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { haptics } from '../../ui/haptics';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, fonts, radius, spacing } from '../../ui/theme';
import { useCheers } from '../audio/useCheers';
import { SkeletonOverlay } from '../pose/SkeletonOverlay';
import { usePoseDetection } from '../pose/usePoseDetection';
import { useHistory } from '../progress/useHistory';
import { CueBanner } from './components/CueBanner';
import { MatchClock } from './components/MatchClock';
import { ScoreBar } from './components/ScoreBar';
import { SetupGuide } from './components/SetupGuide';
import { useMatchSession } from './useMatchSession';

/** How long a rep / rejected-rep flash stays on screen. */
const EVENT_FLASH_MS = 1200;
/** How long the "New record!" moment stays on screen. */
const RECORD_FLASH_MS = 2500;
/** Combo is shown from this many valid reps in a row. */
const MIN_COMBO = 3;

interface Props {
  exercise: ExerciseDefinition;
  timeControlId: TimeControlId;
  mode: MatchMode;
}

export function SessionScreen({ exercise, timeControlId, mode }: Props) {
  useKeepAwake();
  useScreenOrientation(exercise.camera.orientation);
  const { m, f, n, dir } = useI18n();

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const session = useMatchSession({ exercise, timeControlId, mode });
  const detection = usePoseDetection(session.onPose);
  const cheer = useCheers();

  // Personal best for this competition: the target to race against.
  const history = useHistory();
  const best = useMemo(
    () => (history ? personalBest(history, exercise.id, timeControlId) : 0),
    [history, exercise.id, timeControlId],
  );

  // Score in the competition's unit: valid reps, or whole seconds held for holds.
  const hold = isHold(timeControlId);
  const myScore = session.localParticipantId ? session.match?.scores[session.localParticipantId] : undefined;
  const liveHoldMs = session.feedback.inPosition ? (session.feedback.metrics.holdMs ?? 0) : 0;
  const score = hold
    ? Math.floor(Math.max(liveHoldMs, myScore?.holdMs ?? 0) / 1000)
    : (myScore?.reps ?? 0);

  // Reps: cheer + light haptic on every valid rep. Holds: every 10 seconds.
  // Passing the record: success haptic + "New record!" banner.
  const cheeredScoreRef = useRef(0);
  const [recordAt, setRecordAt] = useState<number | null>(null);
  useEffect(() => {
    const previous = cheeredScoreRef.current;
    if (score > previous) {
      if (best > 0 && previous <= best && score > best) {
        cheer();
        haptics.success();
        setRecordAt(Date.now());
      } else if (!hold || Math.floor(score / 10) > Math.floor(previous / 10)) {
        cheer();
        haptics.rep();
      }
    }
    cheeredScoreRef.current = score;
  }, [score, cheer, best, hold]);

  // Rejected rep: short warning haptic.
  const lastEvent = session.feedback.lastEvent;
  useEffect(() => {
    if (lastEvent?.type === 'repRejected') haptics.rejected();
  }, [lastEvent]);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (session.result) {
      router.replace({ pathname: '/results', params: { matchId: session.result.matchId } });
    }
  }, [session.result]);

  if (!hasPermission) {
    return (
      <Centered>
        <AppText center>{m.session.cameraPermission}</AppText>
        <Button label={m.session.allowCamera} onPress={requestPermission} />
      </Centered>
    );
  }
  if (!device) {
    return (
      <Centered>
        <AppText center>{m.session.noCamera}</AppText>
      </Centered>
    );
  }
  if (session.error || detection.error) {
    return (
      <Centered>
        <AppText center>{session.error ? m.session.matchError : m.session.detectorError}</AppText>
        <Button label={m.common.back} onPress={() => router.back()} />
      </Centered>
    );
  }

  const { match, feedback, nowMs } = session;
  const status = match?.status ?? 'setup';
  // Leave room past the record so the marker isn't at the very end of the bar.
  const scaleMax = hold
    ? Math.max(30, Math.ceil(best * 1.25), Math.ceil((score + 10) / 10) * 10)
    : Math.max(10, Math.ceil(best * 1.25), Math.ceil((score + 1) / 10) * 10);
  const showRecord = recordAt !== null && nowMs - recordAt < RECORD_FLASH_MS;

  const countdownLeft =
    status === 'countdown' && match?.countdownEndsAtMs
      ? Math.max(1, Math.ceil((match.countdownEndsAtMs - nowMs) / 1000))
      : null;

  const recent =
    feedback.lastEvent && nowMs - feedback.lastEvent.timestampMs < EVENT_FLASH_MS
      ? feedback.lastEvent
      : null;
  const cue =
    recent?.type === 'repRejected' ? recent.reason : (feedback.cues[0] ?? null);

  return (
    <View style={[styles.root, dir]}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        outputs={[detection.frameOutput]}
      />
      <SkeletonOverlay pose={session.pose} color={feedback.inPosition ? colors.accent : colors.warning} />

      <SafeAreaView style={styles.hud} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.topRow}>
          <ScoreBar
            name={m.common.you}
            reps={score}
            scaleMax={scaleMax}
            color={colors.accent}
            target={best}
          />
          <MatchClock remainingMs={match ? remainingMs(match, nowMs) : 0} />
          {/* Opponent slot: filled by a remote participant in 1v1 matches. */}
          <View style={styles.opponentSlot}>
            <AppText variant="label" color={colors.textMuted}>
              {mode === 'practice' ? m.session.practice : ''}
            </AppText>
            {status === 'live' && feedback.combo >= MIN_COMBO ? (
              <View style={styles.combo} accessibilityLiveRegion="polite">
                <Icon name="fire" size="sm" color={colors.onGold} />
                <AppText variant="bodyBold" color={colors.onGold}>
                  {f(m.game.combo, { count: feedback.combo })}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.center}>
          {status === 'setup' ? (
            <SetupGuide
              title={f(m.session.setupTitle, { exercise: exerciseText(m, exercise.id).name })}
              instructions={exerciseText(m, exercise.id).instructions}
              inPosition={feedback.inPosition}
              readiness={feedback.readiness}
              status={
                detection.status === 'loading' || !match
                  ? m.session.preparing
                  : feedback.inPosition
                    ? m.session.holdIt
                    : feedback.cues[0]
                      ? cueText(m, feedback.cues[0].code)
                      : m.session.lookingForYou
              }
            />
          ) : countdownLeft !== null ? (
            <AppText style={styles.countdown} accessibilityLiveRegion="assertive">
              {n(countdownLeft)}
            </AppText>
          ) : showRecord ? (
            <View style={styles.record} accessibilityLiveRegion="assertive">
              <Icon name="trophy" size="xl" color={colors.gold} />
              <AppText variant="title" color={colors.gold}>
                {m.game.newRecord}
              </AppText>
            </View>
          ) : hold && status === 'live' && feedback.inPosition ? (
            <View style={styles.holdTimer} accessibilityLiveRegion="polite">
              <AppText style={styles.holdSeconds}>{n(score)}</AppText>
              <AppText variant="heading" color={colors.textMuted}>
                {m.game.holdTime}
              </AppText>
            </View>
          ) : recent?.type === 'rep' ? (
            <AppText style={styles.repFlash}>{n('+1')}</AppText>
          ) : null}
        </View>

        <View style={styles.bottomRow}>
          <Button
            label={m.session.quit}
            variant="ghost"
            onPress={() => (status === 'live' ? session.abort() : router.back())}
          />
          <View style={styles.cueSlot}>
            {status === 'live' && cue ? (
              <CueBanner message={cueText(m, cue.code)} severity={cue.severity} />
            ) : null}
          </View>
          <AppText variant="caption" color={colors.textMuted} style={styles.debug}>
            {feedback.metrics.elbowAngle !== undefined
              ? f(m.session.elbowAngle, { angle: feedback.metrics.elbowAngle })
              : ''}
          </AppText>
        </View>
      </SafeAreaView>
    </View>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={[styles.root, styles.centered]}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  hud: {
    ...StyleSheet.absoluteFill,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  opponentSlot: {
    flex: 1,
    alignItems: 'flex-end',
  },
  combo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdown: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 140,
    lineHeight: 150,
  },
  repFlash: {
    color: colors.accent,
    fontFamily: fonts.display,
    fontSize: 88,
    lineHeight: 96,
  },
  holdTimer: {
    alignItems: 'center',
  },
  holdSeconds: {
    color: colors.accent,
    fontFamily: fonts.display,
    fontSize: 120,
    lineHeight: 128,
    fontVariant: ['tabular-nums'],
  },
  record: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(11,15,26,0.85)',
    borderWidth: 2,
    borderColor: colors.gold,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cueSlot: {
    flex: 1,
  },
  debug: {
    minWidth: 80,
    textAlign: 'right',
  },
});
