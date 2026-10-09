import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

import type { ExerciseDefinition } from '../../core/exercises/types';
import { remainingMs } from '../../core/match/matchReducer';
import type { TimeControlId } from '../../core/match/timeControls';
import type { MatchMode } from '../../core/match/types';
import { cueText, exerciseText } from '../../i18n/lookup';
import { useI18n } from '../../i18n/useI18n';
import { Button } from '../../ui/components/Button';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, spacing } from '../../ui/theme';
import { useCheers } from '../audio/useCheers';
import { SkeletonOverlay } from '../pose/SkeletonOverlay';
import { usePoseDetection } from '../pose/usePoseDetection';
import { CueBanner } from './components/CueBanner';
import { MatchClock } from './components/MatchClock';
import { ScoreBar } from './components/ScoreBar';
import { SetupGuide } from './components/SetupGuide';
import { useMatchSession } from './useMatchSession';

/** How long a rep / rejected-rep flash stays on screen. */
const EVENT_FLASH_MS = 1200;

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

  // Cheer on every new valid rep.
  const localReps = session.localParticipantId
    ? (session.match?.scores[session.localParticipantId]?.reps ?? 0)
    : 0;
  const cheeredRepsRef = useRef(0);
  useEffect(() => {
    if (localReps > cheeredRepsRef.current) cheer();
    cheeredRepsRef.current = localReps;
  }, [localReps, cheer]);

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
        <Text style={styles.message}>{m.session.cameraPermission}</Text>
        <Button label={m.session.allowCamera} onPress={requestPermission} />
      </Centered>
    );
  }
  if (!device) {
    return (
      <Centered>
        <Text style={styles.message}>{m.session.noCamera}</Text>
      </Centered>
    );
  }
  if (session.error || detection.error) {
    return (
      <Centered>
        <Text style={styles.message}>
          {session.error ? m.session.matchError : m.session.detectorError}
        </Text>
        <Button label={m.common.back} onPress={() => router.back()} />
      </Centered>
    );
  }

  const { match, feedback, nowMs } = session;
  const status = match?.status ?? 'setup';
  const reps = localReps;
  const scaleMax = Math.max(10, Math.ceil((reps + 1) / 10) * 10);

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
            reps={reps}
            scaleMax={scaleMax}
            color={colors.accent}
          />
          <MatchClock remainingMs={match ? remainingMs(match, nowMs) : 0} />
          {/* Opponent slot: filled by a remote participant in 1v1 matches. */}
          <View style={styles.opponentSlot}>
            <Text style={styles.practiceLabel}>{mode === 'practice' ? m.session.practice : ''}</Text>
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
            <Text style={styles.countdown}>{n(countdownLeft)}</Text>
          ) : recent?.type === 'rep' ? (
            <Text style={styles.repFlash}>{n('+1')}</Text>
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
          <Text style={styles.debug}>
            {feedback.metrics.elbowAngle !== undefined
              ? f(m.session.elbowAngle, { angle: feedback.metrics.elbowAngle })
              : ''}
          </Text>
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
  message: {
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
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
  practiceLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdown: {
    color: colors.text,
    fontSize: 120,
    fontWeight: '900',
  },
  repFlash: {
    color: colors.accent,
    fontSize: 72,
    fontWeight: '900',
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
    color: colors.textMuted,
    fontSize: 12,
    minWidth: 80,
    textAlign: 'right',
  },
});
