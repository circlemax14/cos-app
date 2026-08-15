/**
 * A one-shot confetti burst, in the Outlook style — pieces fire upward and
 * outward, then fall past the bottom of the screen under gravity, tumbling as
 * they go. Vishal 2026-08-15: "i want a party popper in that also along with
 * existing design and this party popper will be like outlook".
 *
 * NO NEW DEPENDENCY. This is plain Views driven by react-native-reanimated,
 * which the welcome screen already imports. A confetti library would have
 * meant a native module, a runtimeVersion bump and a new binary — for a
 * decoration. Everything here ships over the air.
 *
 * The motion is BALLISTIC rather than a straight drop: each piece gets an
 * initial upward velocity and a horizontal one, and gravity turns the first
 * into the second half of an arc. A linear fall reads as a screensaver; the
 * arc is what makes it read as a popper going off.
 *
 * Deterministic, not random. Piece i derives its angle, speed, size and spin
 * from i through a cheap hash. Two mounts look identical, which means this can
 * be eyeballed in review and can't produce a one-in-fifty ugly frame nobody
 * can reproduce.
 *
 * Honours Reduce Motion: renders nothing at all. A burst of moving objects is
 * exactly what that setting exists to suppress, and the screen is complete
 * without it.
 */

import React from 'react'
import { AccessibilityInfo, Dimensions, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'

/** Enough to read as celebratory, few enough to stay smooth on an older phone. */
const PIECE_COUNT = 28
const FALL_MS = 2600

/** Warm + brand-ish. Deliberately not the semantic good/warn/bad palette. */
const COLORS = ['#F59E0B', '#10B981', '#6366F1', '#EC4899', '#0EA5E9', '#F97316'] as const

/**
 * Cheap deterministic pseudo-random in [0,1) from two integers. sin-based
 * hashing is standard for this and is plenty for decoration — the only
 * property needed is "looks unrelated between adjacent i".
 */
function rand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

interface PieceSpec {
  color: string
  size: number
  startX: number
  driftX: number
  riseY: number
  fallY: number
  spin: number
  delay: number
  ratio: number
}

function buildPieces(width: number, height: number): PieceSpec[] {
  return Array.from({ length: PIECE_COUNT }, (_, i) => {
    // Fan out from the middle, widest at the edges of the burst.
    const spread = (rand(i, 1) - 0.5) * width * 1.15
    const size = 7 + rand(i, 2) * 7
    return {
      color: COLORS[i % COLORS.length],
      size,
      startX: width / 2 + spread * 0.12,
      driftX: spread,
      // Up first...
      riseY: -(height * (0.18 + rand(i, 3) * 0.22)),
      // ...then well past the bottom edge, so nothing is left hanging.
      fallY: height * 0.75,
      spin: (rand(i, 4) < 0.5 ? -1 : 1) * (360 + rand(i, 5) * 540),
      delay: rand(i, 6) * 260,
      // Rectangles, not squares — a strip tumbles more legibly than a dot.
      ratio: 0.45 + rand(i, 7) * 0.3,
    }
  })
}

function Piece({ spec }: { spec: PieceSpec }): React.JSX.Element {
  // 0 → 1 across the whole flight. One driver per piece keeps the worklet
  // count down; the arc is derived from it rather than animated separately.
  const t = useSharedValue(0)

  React.useEffect(() => {
    t.value = withDelay(
      spec.delay,
      withTiming(1, { duration: FALL_MS, easing: Easing.linear }),
    )
  }, [t, spec.delay])

  const style = useAnimatedStyle(() => {
    const p = t.value
    // Rise decelerating, fall accelerating — the two halves of a throw.
    // At p=0 y=0; it peaks around p≈0.33 and is well below the fold by p=1.
    const y = spec.riseY * Math.sin(Math.min(p, 1) * Math.PI * 0.5) * (1 - p) + spec.fallY * p * p
    return {
      transform: [
        { translateX: spec.driftX * p },
        { translateY: y },
        { rotate: `${spec.spin * p}deg` },
      ],
      // Hold full opacity for most of the flight, then fade so pieces do not
      // visibly pop out of existence at the edge.
      opacity: p > 0.75 ? Math.max(0, 1 - (p - 0.75) / 0.25) : 1,
    }
  })

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: spec.startX,
          width: spec.size,
          height: spec.size * spec.ratio,
          backgroundColor: spec.color,
        },
        style,
      ]}
    />
  )
}

/**
 * @param originTop Where the burst starts, as a fraction of screen height.
 *                  Defaults to just above the hero so pieces appear to come
 *                  out from behind it rather than off the top of the screen.
 */
export function ConfettiBurst({ originTop = 0.3 }: { originTop?: number }): React.JSX.Element | null {
  const { width, height } = Dimensions.get('window')
  const [reduceMotion, setReduceMotion] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (alive) setReduceMotion(v) })
      .catch(() => { if (alive) setReduceMotion(false) })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setReduceMotion(v),
    )
    return () => {
      alive = false
      sub?.remove?.()
    }
  }, [])

  // null = not resolved yet. Render nothing rather than firing a burst we may
  // be about to learn the user asked not to see.
  if (reduceMotion !== false) return null

  const pieces = buildPieces(width, height)

  return (
    <View
      pointerEvents="none"
      style={[styles.layer, { top: height * originTop }]}
      // Purely decorative: it must never take VoiceOver focus or be described.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {pieces.map((spec, i) => (
        <Piece key={i} spec={spec} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject, bottom: undefined, height: 0 },
  piece: { position: 'absolute', borderRadius: 1.5 },
})
