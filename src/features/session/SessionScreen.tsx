import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';

import type { ExerciseDefinition } from '../../core/exercises/types';
import { primaryScore, remainingMs } from '../../core/match/matchReducer';
import { isGame, isHold, type TimeControlId } from '../../core/match/timeControls';
import type { MatchMode } from '../../core/match/types';
import { personalBest } from '../../core/progress/progress';
import { cueText, exerciseText, timeControlText } from '../../i18n/lookup';
import { ChallengeError, type ChallengeMatch } from '../../services/types';
import { useI18n } from '../../i18n/useI18n';
import { AppText } from '../../ui/components/AppText';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { haptics } from '../../ui/haptics';
import { useScreenOrientation } from '../../ui/hooks/useScreenOrientation';
import { colors, fonts, radius, spacing } from '../../ui/theme';
import { useCheers } from '../audio/useCheers';
import { useMatchAudio } from '../audio/useMatchAudio';
import { useSettings } from '../settings/SettingsProvider';
import { SkeletonOverlay } from '../pose/SkeletonOverlay';
import { usePoseDetection } from '../pose/usePoseDetection';
import { useHistory } from '../progress/useHistory';
import { CueBanner } from './components/CueBanner';
import { FlappyField } from './components/FlappyField';
import { MatchClock } from './components/MatchClock';
import { ChatBubbleView, QuickChat } from './components/QuickChat';
import { ScoreBar } from './components/ScoreBar';
import { SetupGuide } from './components/SetupGuide';
import { VsIntro } from './components/VsIntro';
import { useMatchSession } from './useMatchSession';

/** How long a rep / rejected-rep flash stays on screen. */
const EVENT_FLASH_MS = 1200;
/** How long the "New record!" moment stays on screen. */
const RECORD_FLASH_MS = 2500;
/** Combo is shown from this many valid reps in a row. */
const MIN_COMBO = 3;
/** How long a quick-chat bubble stays on screen. */
const CHAT_BUBBLE_MS = 3000;
/** How long the online VS intro stays before the setup guide (tap to skip). */
const VS_INTRO_MS = 4000;

/** A friend challenge: you sent it (wait for the answer) or accepted it. */
export interface SessionChallenge extends ChallengeMatch {
  opponent: string;
  role: 'sent' | 'received';
}

interface Props {
  exercise: ExerciseDefinition;
  timeControlId: TimeControlId;
  mode: MatchMode;
  challenge?: SessionChallenge;
}

export function SessionScreen({ exercise, timeControlId, mode, challenge }: Props) {
  useKeepAwake();
  useScreenOrientation(exercise.camera.orientation);
  const { m, f, n, dir } = useI18n();

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const session = useMatchSession({ exercise, timeControlId, mode, challenge });
  const detection = usePoseDetection(session.onPose);
  const cheer = useCheers();
  const { settings } = useSettings();

  // Personal best for this competition: the target to race against.
  const history = useHistory();
  const best = useMemo(
    () => (history ? personalBest(history, exercise.id, timeControlId) : 0),
    [history, exercise.id, timeControlId],
  );

  // Score in the competition's unit: valid reps, seconds held (holds) or points (games).
  const hold = isHold(timeControlId);
  const game = isGame(timeControlId);
  const myScore = session.localParticipantId ? session.match?.scores[session.localParticipantId] : undefined;
  const liveHoldMs = session.feedback.inPosition ? (session.feedback.metrics.holdMs ?? 0) : 0;
  const score = hold
    ? Math.floor(Math.max(liveHoldMs, myScore?.holdMs ?? 0) / 1000)
    : game
      ? Math.max(myScore?.points ?? 0, session.feedback.game?.points ?? 0)
      : (myScore?.reps ?? 0);

  // 1v1: the other participant and their score in the same unit.
  const opponent = session.match?.config.participants.find((p) => !p.isLocal) ?? null;
  const opponentScoreRaw = opponent ? session.match?.scores[opponent.id] : undefined;
  const opponentScore = opponentScoreRaw
    ? hold
      ? Math.floor(primaryScore(timeControlId, opponentScoreRaw) / 1000)
      : primaryScore(timeControlId, opponentScoreRaw)
    : 0;

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

  // Arena music and effects for timed competitions and games (holds stay calm).
  const audioMatch = session.match;
  useMatchAudio({
    enabled: settings.musicEnabled && !hold,
    status: audioMatch?.status ?? 'setup',
    remainingMs: audioMatch ? remainingMs(audioMatch, session.nowMs) : 0,
    durationMs: audioMatch?.config.durationMs ?? 60_000,
    countdownLeft:
      audioMatch?.status === 'countdown' && audioMatch.countdownEndsAtMs
        ? Math.max(1, Math.ceil((audioMatch.countdownEndsAtMs - session.nowMs) / 1000))
        : null,
    finishReason: audioMatch?.finishReason ?? null,
  });

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

  // Online: leaving a match in progress forfeits it, so ask first (quit button and Android back).
  const matchStatus = session.match?.status;
  const online = session.online;
  const { abort } = session;
  const confirmLeave = useMemo(() => {
    const inProgress = online && matchStatus !== undefined && matchStatus !== 'finished';
    const leave = () => (matchStatus === 'live' ? abort() : router.back());
    if (!inProgress) return leave;
    return () =>
      Alert.alert(m.session.leaveTitle, m.session.leaveMessage, [
        { text: m.session.stay, style: 'cancel' },
        { text: m.session.leave, style: 'destructive', onPress: leave },
      ]);
  }, [online, matchStatus, abort, m]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmLeave();
      return true;
    });
    return () => sub.remove();
  }, [confirmLeave]);

  // Online: VS intro when the opponent is found.
  const [introDismissedAt, setIntroDismissedAt] = useState<number | null>(null);
  const [introStartedAt, setIntroStartedAt] = useState<number | null>(null);
  const opponentId = opponent?.id;
  useEffect(() => {
    if (!online || !opponentId) return;
    const start = setTimeout(() => setIntroStartedAt(Date.now()), 0);
    const end = setTimeout(() => setIntroDismissedAt(Date.now()), VS_INTRO_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(end);
    };
  }, [online, opponentId]);

  if (!hasPermission) {
    // If the system won't ask again (denied before), the button opens the app's settings.
    const allowCamera = async () => {
      if (!(await requestPermission())) Linking.openSettings().catch(() => {});
    };
    return (
      <Centered>
        <AppText center>{m.session.cameraPermission}</AppText>
        <Button label={m.session.allowCamera} icon="camera" onPress={allowCamera} />
        <AppText variant="caption" color={colors.textMuted} center>
          {m.session.cameraSettingsHint}
        </AppText>
        <Button label={m.common.back} variant="ghost" onPress={() => router.back()} />
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
  // Friend challenge: waiting for the friend to accept (or joining their match).
  if (!session.match && challenge && !session.error) {
    return (
      <Centered>
        <Icon name="sword-cross" size="xl" color={colors.opponent} />
        <AppText variant="heading" center>
          {f(challenge.role === 'sent' ? m.challenge.waiting : m.challenge.joining, { username: challenge.opponent })}
        </AppText>
        <AppText variant="label" color={colors.textMuted} center>
          {exerciseText(m, exercise.id).name} · {timeControlText(m, timeControlId).label}
        </AppText>
        {challenge.role === 'sent' ? <SecondsLeft until={challenge.expiresAt} /> : null}
        <Button label={m.online.cancel} variant="ghost" onPress={() => router.back()} />
      </Centered>
    );
  }
  if (session.error instanceof ChallengeError) {
    const text = { declined: m.challenge.declined, noAnswer: m.challenge.noAnswer, expired: m.challenge.expired }[
      session.error.reason
    ];
    return (
      <Centered>
        <Icon name="account-clock-outline" size="xl" color={colors.textMuted} />
        <AppText variant="heading" center>
          {f(text, { username: challenge?.opponent ?? '' })}
        </AppText>
        <Button label={m.common.back} onPress={() => router.back()} />
      </Centered>
    );
  }
  // Online: matchmaking until an opponent is found.
  if (!session.match && mode !== 'practice' && !session.error) {
    return (
      <Centered>
        <Icon name="sword-cross" size="xl" color={colors.opponent} />
        <AppText variant="heading" center>
          {m.online.searching}
        </AppText>
        <AppText variant="label" color={colors.textMuted} center>
          {exerciseText(m, exercise.id).name}
        </AppText>
        <Button label={m.online.cancel} variant="ghost" onPress={() => router.back()} />
      </Centered>
    );
  }
  if (session.error || detection.error) {
    return (
      <Centered>
        <AppText center>
          {session.error
            ? session.online || mode !== 'practice'
              ? m.online.connectionError
              : m.session.matchError
            : m.session.detectorError}
        </AppText>
        <Button label={m.common.back} onPress={() => router.back()} />
      </Centered>
    );
  }

  const { match, feedback, nowMs } = session;
  const status = match?.status ?? 'setup';
  // Leave room past the record so the marker isn't at the very end of the bar.
  const leader = Math.max(score, opponentScore);
  const scaleMax = hold
    ? Math.max(30, Math.ceil(best * 1.25), Math.ceil((leader + 10) / 10) * 10)
    : Math.max(10, Math.ceil(best * 1.25), Math.ceil((leader + 1) / 10) * 10);
  const crashed = game && status === 'live' && !!feedback.game?.crashed;
  const showRecord = recordAt !== null && nowMs - recordAt < RECORD_FLASH_MS;

  const countdownLeft =
    status === 'countdown' && match?.countdownEndsAtMs
      ? Math.max(1, Math.ceil((match.countdownEndsAtMs - nowMs) / 1000))
      : null;

  const recent =
    feedback.lastEvent && nowMs - feedback.lastEvent.timestampMs < EVENT_FLASH_MS ? feedback.lastEvent : null;
  const cue = recent?.type === 'repRejected' ? recent.reason : (feedback.cues[0] ?? null);

  const you = match?.config.participants.find((p) => p.isLocal) ?? null;
  const bubble = (id: string | undefined) => {
    const b = id ? session.chat[id] : undefined;
    return b && nowMs - b.atMs < CHAT_BUBBLE_MS ? b.code : null;
  };
  const myBubble = bubble(you?.id);
  const opponentBubble = bubble(opponent?.id);
  const showIntro =
    session.online && you && opponent && introStartedAt !== null && introDismissedAt === null && status === 'setup';

  return (
    <View style={[styles.root, dir]}>
      <Camera style={StyleSheet.absoluteFill} device={device} isActive outputs={[detection.frameOutput]} />
      <SkeletonOverlay pose={session.pose} color={feedback.inPosition ? colors.accent : colors.warning} />
      {game && match ? (
        <FlappyField
          seed={match.config.seed ?? 0}
          startedAtMs={match.startedAtMs}
          live={status === 'live'}
          birdY={feedback.metrics.birdY ?? 0.5}
          crashed={!!feedback.game?.crashed}
          ghosts={
            opponent && session.opponentBirds[opponent.id] !== undefined && !opponentScoreRaw?.done
              ? [{ id: opponent.id, y: session.opponentBirds[opponent.id], label: opponent.displayName }]
              : []
          }
        />
      ) : null}

      <SafeAreaView style={styles.hud} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.topRow}>
          <View style={styles.youSlot}>
            <ScoreBar name={m.common.you} reps={score} scaleMax={scaleMax} color={colors.accent} target={best} />
            {myBubble ? <ChatBubbleView code={myBubble} color={colors.accent} align="left" /> : null}
          </View>
          <MatchClock remainingMs={match ? remainingMs(match, nowMs) : 0} />
          {/* Opponent slot: their live score bar in 1v1, mirrored on the other side. */}
          <View style={styles.opponentSlot}>
            {opponent ? (
              <ScoreBar
                name={opponent.displayName}
                reps={opponentScore}
                scaleMax={scaleMax}
                color={colors.opponent}
                align="right"
              />
            ) : (
              <AppText variant="label" color={colors.textMuted}>
                {mode === 'practice' ? m.session.practice : ''}
              </AppText>
            )}
            {status === 'live' && feedback.combo >= MIN_COMBO ? (
              <View style={styles.combo} accessibilityLiveRegion="polite">
                <Icon name="fire" size="sm" color={colors.onGold} />
                <AppText variant="bodyBold" color={colors.onGold}>
                  {f(m.game.combo, { count: feedback.combo })}
                </AppText>
              </View>
            ) : null}
            {opponentBubble ? <ChatBubbleView code={opponentBubble} color={colors.opponent} align="right" /> : null}
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
                  : feedback.waitingForOpponent
                    ? m.online.waitingOpponent
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
          ) : crashed ? (
            <View style={styles.record} accessibilityLiveRegion="assertive">
              <Icon name="bird" size="xl" color={colors.danger} />
              <AppText variant="title" color={colors.danger}>
                {feedback.game?.reason === 'plank' ? m.game.crashedPlank : m.game.crashedPipe}
              </AppText>
              <AppText variant="heading">{f(m.game.pipes, { count: score })}</AppText>
              {opponent ? (
                <AppText variant="label" color={colors.textMuted}>
                  {m.online.waitingOpponent}
                </AppText>
              ) : null}
            </View>
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
          <Button label={m.session.quit} variant="ghost" onPress={confirmLeave} />
          <View style={styles.cueSlot}>
            {status === 'live' && cue ? <CueBanner message={cueText(m, cue.code)} severity={cue.severity} /> : null}
          </View>
          {session.online && opponent && status !== 'finished' ? (
            <QuickChat onSend={session.sendChat} />
          ) : (
            <AppText variant="caption" color={colors.textMuted} style={styles.debug}>
              {feedback.metrics.elbowAngle !== undefined
                ? f(m.session.elbowAngle, { angle: feedback.metrics.elbowAngle })
                : ''}
            </AppText>
          )}
        </View>
      </SafeAreaView>
      {showIntro ? (
        <VsIntro
          you={you}
          opponent={opponent}
          exerciseName={exerciseText(m, exercise.id).name}
          onDismiss={() => setIntroDismissedAt(Date.now())}
        />
      ) : null}
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
  youSlot: {
    flex: 1,
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

/** Seconds until the challenge expires, updated every second. */
function SecondsLeft({ until }: { until: number }) {
  const { m, f } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((until - now) / 1000));
  return (
    <AppText variant="caption" color={colors.textMuted} center accessibilityLiveRegion="polite">
      {f(m.challenge.secondsLeft, { seconds })}
    </AppText>
  );
}
