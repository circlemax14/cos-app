import React from 'react'
import {
  AccessibilityInfo,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated'
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import type { EarnedBadge, BadgeTier } from '@/services/api/badges'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

const TIER_COLORS: Record<BadgeTier, { base: string; highlight: string }> = {
  bronze: { base: '#CD7F32', highlight: '#E8A55F' },
  silver: { base: '#C0C0C0', highlight: '#E5E5E5' },
  gold:   { base: '#FFD700', highlight: '#FFF1A0' },
}

const PARTICLE_COUNT = 24

interface BadgeCelebrationProps {
  badge: EarnedBadge
  onDismiss: () => void
  /** Total time the overlay stays on screen. Defaults to 3500ms. */
  durationMs?: number
}

/**
 * Full-screen celebration overlay. Played when a user earns a new badge —
 * Apple-Watch-style sequence: backdrop fade, medallion spring + flip, particle
 * burst, title text slide, haptic success. Auto-dismisses after `durationMs`
 * or on tap.
 *
 * If the user has Reduce Motion turned on, the animations are skipped — we
 * just announce "Badge earned: <name>" via the screen reader and keep the
 * overlay visible for half the normal duration so the user can read it.
 */
export function BadgeCelebration({
  badge,
  onDismiss,
  durationMs = 3500,
}: BadgeCelebrationProps): React.JSX.Element {
  const [reduceMotion, setReduceMotion] = React.useState(false)
  const colors = TIER_COLORS[badge.tier]

  // Animation shared values
  const backdropOpacity = useSharedValue(0)
  const medallionScale = useSharedValue(0)
  const medallionRotate = useSharedValue(0)
  const titleY = useSharedValue(30)
  const titleOpacity = useSharedValue(0)

  React.useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled()
      .then((rm) => { if (!cancelled) setReduceMotion(rm) })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [])

  React.useEffect(() => {
    // Haptic success — fire immediately on mount (silent on devices without haptic)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { /* ignore */ })

    if (reduceMotion) {
      // Static display: just fade backdrop in, no medallion animation
      backdropOpacity.value = withTiming(0.7, { duration: 200 })
      medallionScale.value = 1
      titleOpacity.value = withTiming(1, { duration: 200 })
      titleY.value = 0
      AccessibilityInfo.announceForAccessibility(`Badge earned: ${badge.name}, ${badge.tier} tier`)
    } else {
      backdropOpacity.value = withTiming(0.7, { duration: 200 })
      medallionScale.value = withDelay(
        100,
        withSequence(
          withSpring(1.1, { damping: 6, stiffness: 100 }),
          withSpring(1.0, { damping: 10, stiffness: 100 }),
        ),
      )
      medallionRotate.value = withDelay(400, withTiming(360, { duration: 600, easing: Easing.inOut(Easing.cubic) }))
      titleY.value = withDelay(800, withSpring(0, { damping: 12, stiffness: 100 }))
      titleOpacity.value = withDelay(800, withTiming(1, { duration: 300 }))
    }

    const dismissDelay = reduceMotion ? durationMs / 2 : durationMs
    const timer = setTimeout(() => {
      backdropOpacity.value = withTiming(0, { duration: 250 }, (finished) => {
        if (finished) runOnJS(onDismiss)()
      })
    }, dismissDelay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion])

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }))
  const medallionStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: medallionScale.value },
      { rotateY: `${medallionRotate.value}deg` },
    ],
  }))
  const titleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: titleY.value }],
    opacity: titleOpacity.value,
  }))

  const subtitle = badge.nextThreshold
    ? `${cap(badge.tier)} · ${badge.progress} so far · next at ${badge.nextThreshold}`
    : `${cap(badge.tier)} · maxed out`

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        pointerEvents="auto"
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            backdropOpacity.value = withTiming(0, { duration: 250 }, (finished) => {
              if (finished) runOnJS(onDismiss)()
            })
          }}
          accessibilityRole="button"
          accessibilityLabel={`Badge earned: ${badge.name}. Tap to dismiss.`}
        >
          <View style={styles.centerArea}>
            {/* Particle burst — sits behind the medallion */}
            {!reduceMotion ? <ParticleBurst color={colors.base} /> : null}

            <Animated.View style={[styles.medallionWrap, medallionStyle]}>
              <Medallion colors={colors} category={badge.category} />
            </Animated.View>

            <Animated.View style={[styles.titleWrap, titleStyle]}>
              <Text style={styles.title} numberOfLines={2}>{badge.name}</Text>
              <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
            </Animated.View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  )
}

function cap(s: string): string { return s[0].toUpperCase() + s.slice(1) }

/**
 * Placeholder medallion. Designer can swap for a custom raster/SVG asset
 * later; this is sufficiently polished for QA + first ship. A radial
 * gradient gives the metal-medallion feel; the inner glyph hints at the
 * category.
 */
function Medallion({
  colors,
  category,
}: {
  colors: { base: string; highlight: string }
  category: EarnedBadge['category']
}): React.JSX.Element {
  return (
    <Svg width={160} height={160} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="grad" cx="40%" cy="35%" r="65%">
          <Stop offset="0%" stopColor={colors.highlight} />
          <Stop offset="100%" stopColor={colors.base} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={48} fill="url(#grad)" stroke="#00000020" strokeWidth={1} />
      <Circle cx={50} cy={50} r={38} fill="none" stroke="#ffffff60" strokeWidth={0.8} />
      <CategoryGlyph category={category} />
    </Svg>
  )
}

/** Simple category-specific symbol stamped on the medallion. */
function CategoryGlyph({ category }: { category: EarnedBadge['category'] }): React.JSX.Element {
  switch (category) {
    case 'streak':
      // Stylized flame
      return (
        <Path
          d="M50 25 C40 38, 35 48, 40 60 C42 68, 47 72, 50 72 C53 72, 58 68, 60 60 C62 52, 55 48, 53 42 C52 38, 53 32, 50 25 Z"
          fill="#ffffffd0"
        />
      )
    case 'adherence':
      // Bullseye / target rings
      return (
        <>
          <Circle cx={50} cy={50} r={16} fill="none" stroke="#ffffffe0" strokeWidth={2.5} />
          <Circle cx={50} cy={50} r={9} fill="none" stroke="#ffffffe0" strokeWidth={2.5} />
          <Circle cx={50} cy={50} r={3} fill="#ffffffe0" />
        </>
      )
    case 'per-task-type':
      // Checkmark
      return (
        <Path
          d="M36 51 L46 61 L66 38"
          fill="none"
          stroke="#ffffffe0"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'awareness':
    default:
      // Star
      return (
        <Path
          d="M50 30 L54 44 L68 44 L57 52 L61 66 L50 58 L39 66 L43 52 L32 44 L46 44 Z"
          fill="#ffffffe0"
        />
      )
  }
}

/**
 * Radial confetti burst — 24 particles emit from the center, expand outward,
 * and fall under simulated gravity over ~2s. Built on reanimated so we don't
 * pull in a separate animation library.
 */
function ParticleBurst({ color }: { color: string }): React.JSX.Element {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <Particle key={i} index={i} color={color} total={PARTICLE_COUNT} />
      ))}
    </View>
  )
}

function Particle({
  index,
  total,
  color,
}: {
  index: number
  total: number
  color: string
}): React.JSX.Element {
  const angle = (Math.PI * 2 * index) / total
  const distance = 140 + Math.random() * 80
  const dx = Math.cos(angle) * distance
  const dy = Math.sin(angle) * distance
  const gravity = 220

  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const opacity = useSharedValue(1)

  React.useEffect(() => {
    tx.value = withDelay(500, withTiming(dx, { duration: 1500, easing: Easing.out(Easing.cubic) }))
    ty.value = withDelay(
      500,
      withSequence(
        withTiming(dy, { duration: 700, easing: Easing.out(Easing.cubic) }),
        withTiming(dy + gravity, { duration: 1200, easing: Easing.in(Easing.cubic) }),
      ),
    )
    opacity.value = withDelay(1600, withTiming(0, { duration: 500 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    opacity: opacity.value,
  }))

  // Mix tier color with gold/white for visual variety
  const palette = [color, '#FFD700', '#FFFFFF', '#FFE4A0']
  const fill = palette[index % palette.length]
  const size = 6 + (index % 3) * 2

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: SCREEN_W / 2 - size / 2,
          top: SCREEN_H / 2 - size / 2,
          width: size,
          height: size,
          backgroundColor: fill,
          borderRadius: size / 2,
        },
        animatedStyle,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medallionWrap: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  titleWrap: {
    marginTop: 32,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#ffffffaa',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
})
