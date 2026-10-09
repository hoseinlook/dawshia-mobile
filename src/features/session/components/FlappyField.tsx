import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { FLAPPY, visiblePipes } from '../../../core/games/flappy';
import { AppText } from '../../../ui/components/AppText';
import { colors } from '../../../ui/theme';

interface Ghost {
  id: string;
  y: number;
  label: string;
}

interface Props {
  seed: number;
  /** Local clock time when the match went live (null before). */
  startedAtMs: number | null;
  live: boolean;
  /** This player's bird height (0 top … 1 bottom). */
  birdY: number;
  crashed: boolean;
  /** Other players' birds (1v1), drawn as translucent ghosts on the same course. */
  ghosts: Ghost[];
}

const BIRD_SIZE_RATIO = FLAPPY.birdRadius * 2;

/** Animated Flappy Push course drawn over the camera. Pure function of (seed, time). */
export function FlappyField({ seed, startedAtMs, live, birdY, crashed, ghosts }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [elapsed, setElapsed] = useState(0);

  // Animate the course every frame while live.
  useEffect(() => {
    if (!live || startedAtMs === null) return;
    let frame = 0;
    const loop = () => {
      setElapsed(Date.now() - startedAtMs);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [live, startedAtMs]);

  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);
  const { width: w, height: h } = size;
  const bird = BIRD_SIZE_RATIO * h;

  return (
    <View style={styles.field} pointerEvents="none" onLayout={onLayout}>
      {w > 0
        ? visiblePipes(seed, live ? elapsed : 0).map((pipe) => {
            const left = (pipe.x - FLAPPY.pipeWidth / 2) * w;
            const pipeW = FLAPPY.pipeWidth * w;
            const gapTop = (pipe.gapCenter - pipe.gapSize / 2) * h;
            const gapBottom = (pipe.gapCenter + pipe.gapSize / 2) * h;
            return (
              <View key={pipe.index}>
                <View style={[styles.pipe, { left, width: pipeW, top: 0, height: gapTop }]} />
                <View style={[styles.pipe, { left, width: pipeW, top: gapBottom, height: h - gapBottom }]} />
              </View>
            );
          })
        : null}

      {w > 0
        ? ghosts.map((g) => (
            <View
              key={g.id}
              style={[
                styles.bird,
                styles.ghost,
                { width: bird, height: bird, borderRadius: bird / 2, left: FLAPPY.birdX * w - bird / 2, top: g.y * h - bird / 2 },
              ]}
            >
              <AppText variant="caption" color={colors.text} style={styles.ghostLabel} numberOfLines={1}>
                {g.label}
              </AppText>
            </View>
          ))
        : null}

      {w > 0 ? (
        <View
          style={[
            styles.bird,
            crashed && styles.crashed,
            { width: bird, height: bird, borderRadius: bird / 2, left: FLAPPY.birdX * w - bird / 2, top: birdY * h - bird / 2 },
          ]}
        >
          <View style={[styles.eye, { width: bird * 0.28, height: bird * 0.28, borderRadius: bird * 0.14 }]} />
          <View style={[styles.beak, { borderLeftWidth: bird * 0.35, borderTopWidth: bird * 0.15, borderBottomWidth: bird * 0.15 }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(59,47,99,0.25)',
    overflow: 'hidden',
  },
  pipe: {
    position: 'absolute',
    backgroundColor: colors.game,
    borderColor: colors.onGame,
    borderWidth: 3,
    borderRadius: 6,
    opacity: 0.92,
  },
  bird: {
    position: 'absolute',
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.onAccent,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  crashed: {
    backgroundColor: colors.danger,
  },
  ghost: {
    backgroundColor: colors.opponent,
    opacity: 0.55,
    alignItems: 'center',
  },
  ghostLabel: {
    position: 'absolute',
    top: -20,
    width: 120,
    textAlign: 'center',
  },
  eye: {
    position: 'absolute',
    top: '22%',
    right: '18%',
    backgroundColor: colors.onAccent,
  },
  beak: {
    position: 'absolute',
    right: '-28%',
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colors.gold,
  },
});
